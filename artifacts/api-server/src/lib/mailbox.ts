import { createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, mailboxes } from "@workspace/db";
import { appOrigin } from "./config";
import { encryptTokens, decryptTokens } from "./security";

export type Provider = "gmail" | "outlook";
const env = process.env;
export const realSend = () => env.REAL_SEND === "true";
export const encryptionReady = () => /^[a-fA-F0-9]{64}$/.test(env.ENCRYPTION_KEY || "");
export const providerConfigured = (p: Provider) => p === "gmail"
  ? Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) : Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
export const callbackPath = (p: Provider) => `/api/mailboxes/oauth/${p}/callback`;
export const redirectUri = (p: Provider) => `${appOrigin()}${callbackPath(p)}`;
// Send-only scopes. offline_access is required by Microsoft for a refresh token.
const SCOPES = { gmail: "https://www.googleapis.com/auth/gmail.send", outlook: "offline_access https://graph.microsoft.com/Mail.Send" };

const sign = (v: string) => createHmac("sha256", env.SESSION_SECRET || "").update(v).digest("base64url").slice(0, 32);
export const makeState = (clientId: string, userId: string) => { const v = `${clientId}.${userId}.${randomBytes(8).toString("hex")}`; return `${v}.${sign(v)}`; };
export function readState(state: string) {
  const parts = state.split("."); const sig = parts.pop(); const v = parts.join(".");
  if (!sig || sig !== sign(v) || parts.length !== 3) return null;
  return { clientId: parts[0]!, userId: parts[1]! };
}
export function authorizeUrl(p: Provider, state: string) {
  const q = new URLSearchParams({ client_id: p === "gmail" ? env.GOOGLE_CLIENT_ID! : env.MICROSOFT_CLIENT_ID!, redirect_uri: redirectUri(p),
    response_type: "code", scope: SCOPES[p], state, ...(p === "gmail" ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" }) });
  return p === "gmail" ? `https://accounts.google.com/o/oauth2/v2/auth?${q}` : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
}
const tokenUrl = (p: Provider) => p === "gmail" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
async function tokenRequest(p: Provider, params: Record<string, string>) {
  const r = await fetch(tokenUrl(p), { method: "POST", signal: AbortSignal.timeout(15000), headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: p === "gmail" ? env.GOOGLE_CLIENT_ID! : env.MICROSOFT_CLIENT_ID!,
      client_secret: p === "gmail" ? env.GOOGLE_CLIENT_SECRET! : env.MICROSOFT_CLIENT_SECRET!, ...params }) });
  const data = await r.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !data.access_token) throw new Error(`${p} token exchange failed (${data.error || r.status})`);
  return data;
}
export async function connect(p: Provider, agencyId: string, clientId: string, code: string) {
  const t = await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p), ...(p === "outlook" ? { scope: SCOPES.outlook } : {}) });
  if (!t.refresh_token) throw new Error("No refresh token returned; remove the app's access and connect again.");
  const tokensEncrypted = encryptTokens(JSON.stringify({ refresh_token: t.refresh_token }));
  // Send-only scopes cannot read the profile, so the address is not known; it is shown as the provider account.
  const label = p === "gmail" ? "Gmail account (send-only)" : "Outlook account (send-only)";
  const [existing] = await db.select().from(mailboxes).where(and(eq(mailboxes.agencyId, agencyId), eq(mailboxes.clientId, clientId), eq(mailboxes.provider, p)));
  if (existing) await db.update(mailboxes).set({ tokensEncrypted, status: "connected", email: label }).where(eq(mailboxes.id, existing.id));
  else await db.insert(mailboxes).values({ agencyId, clientId, provider: p, email: label, tokensEncrypted, status: "connected", dailyCap: 30 });
}
const b64url = (s: string) => Buffer.from(s).toString("base64url");
/** Sends one plain-text email through a connected mailbox. */
export async function sendViaMailbox(box: typeof mailboxes.$inferSelect, mail: { to: string; subject: string; text: string; unsubscribe: string }) {
  const p = box.provider as Provider;
  const { refresh_token } = JSON.parse(decryptTokens(box.tokensEncrypted)) as { refresh_token: string };
  const { access_token } = await tokenRequest(p, { grant_type: "refresh_token", refresh_token, ...(p === "outlook" ? { scope: SCOPES.outlook } : {}) });
  const signal = AbortSignal.timeout(20000);
  if (p === "gmail") {
    const raw = [`To: ${mail.to}`, `Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString("base64")}?=`, `List-Unsubscribe: ${mail.unsubscribe}`,
      "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", Buffer.from(mail.text).toString("base64")].join("\r\n");
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", signal,
      headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" }, body: JSON.stringify({ raw: b64url(raw) }) });
    if (!r.ok) throw new Error(`Gmail send HTTP ${r.status}`);
    return ((await r.json()) as { id?: string }).id ?? null;
  }
  const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", signal,
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { subject: mail.subject, body: { contentType: "Text", content: mail.text }, toRecipients: [{ emailAddress: { address: mail.to } }],
      internetMessageHeaders: [{ name: "x-tawqeet-unsubscribe", value: mail.unsubscribe }] }, saveToSentItems: true }) });
  if (!r.ok) throw new Error(`Outlook send HTTP ${r.status}`);
  return null;
}
