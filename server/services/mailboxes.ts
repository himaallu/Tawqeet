import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { mailboxes } from "../db/schema";
import { decryptJson, encryptJson } from "../lib/crypto";
import { http } from "../lib/http";

/**
 * The client's own mailbox. Send-only scopes:
 *   Gmail:   https://www.googleapis.com/auth/gmail.send   (+ openid email to learn the address)
 *   Outlook: https://graph.microsoft.com/Mail.Send        (+ openid email offline_access)
 * No read scopes are ever requested. Tokens are encrypted at rest with ENCRYPTION_KEY.
 */
type Mailbox = typeof mailboxes.$inferSelect;
type Tokens = { access_token: string; refresh_token?: string; expires_at: number };

const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "openid", "email"];
const MS_SCOPES = ["https://graph.microsoft.com/Mail.Send", "openid", "email", "offline_access"];

const redirectUri = (provider: "gmail" | "outlook") => `${(process.env.APP_URL ?? "http://localhost:5000").replace(/\/$/, "")}/api/oauth/${provider}/callback`;

// ---------- signed OAuth state ----------

function stateKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY is not set");
  return Buffer.from(k, "base64");
}

export type OAuthState = { agencyId: string; clientId: string; userId: string; exp: number; n: string };

export function signState(s: Omit<OAuthState, "exp" | "n">): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + 10 * 60_000, n: randomBytes(8).toString("hex") })).toString("base64url");
  const mac = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state: string): OAuthState | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", stateKey()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const s = JSON.parse(Buffer.from(body, "base64url").toString()) as OAuthState;
  return s.exp > Date.now() ? s : null;
}

// ---------- OAuth ----------

export function authorizeUrl(provider: "gmail" | "outlook", state: string): string {
  if (provider === "gmail") {
    if (!process.env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not set");
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri("gmail"),
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  if (!process.env.MICROSOFT_CLIENT_ID) throw new Error("MICROSOFT_CLIENT_ID is not set");
  const q = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    redirect_uri: redirectUri("outlook"),
    response_type: "code",
    scope: MS_SCOPES.join(" "),
    response_mode: "query",
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
}

const tokenUrl = (p: "gmail" | "outlook") =>
  p === "gmail" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

const creds = (p: "gmail" | "outlook") =>
  p === "gmail"
    ? { client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "" }
    : { client_id: process.env.MICROSOFT_CLIENT_ID ?? "", client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "" };

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string };

async function tokenRequest(provider: "gmail" | "outlook", params: Record<string, string>): Promise<TokenResponse> {
  const res = await http(tokenUrl(provider), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...creds(provider), ...params }),
  });
  if (!res.ok) throw new Error(`${provider} token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TokenResponse;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()) as { email?: string; preferred_username?: string };
    return (payload.email ?? payload.preferred_username ?? null)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

const GRANT_ALLOWED = {
  gmail: new Set(["https://www.googleapis.com/auth/gmail.send", "openid", "email", "https://www.googleapis.com/auth/userinfo.email"]),
  outlook: new Set(["Mail.Send", "https://graph.microsoft.com/Mail.Send", "openid", "email", "profile", "offline_access"]),
};

/** Refuses grants that include anything beyond send + identity. */
export function assertSendOnly(provider: "gmail" | "outlook", scope?: string) {
  const extra = (scope ?? "").split(/\s+/).filter((s) => s && !GRANT_ALLOWED[provider].has(s));
  if (extra.length) throw new Error(`Refusing mailbox grant with extra scopes: ${extra.join(", ")}`);
}

export async function completeOAuth(provider: "gmail" | "outlook", code: string, state: OAuthState) {
  const t = await tokenRequest(provider, { code, grant_type: "authorization_code", redirect_uri: redirectUri(provider) });
  assertSendOnly(provider, t.scope);
  const email = emailFromIdToken(t.id_token);
  if (!email) throw new Error("Could not read the mailbox address from the sign-in");
  const tokens: Tokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
  const [existing] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.agencyId, state.agencyId), eq(mailboxes.clientId, state.clientId), eq(mailboxes.email, email)));
  if (existing) {
    await db.update(mailboxes).set({ tokensEncrypted: encryptJson(tokens), status: "connected", pausedReason: null }).where(eq(mailboxes.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(mailboxes)
    .values({ agencyId: state.agencyId, clientId: state.clientId, provider, email, tokensEncrypted: encryptJson(tokens) })
    .returning();
  return row.id;
}

async function accessToken(mb: Mailbox): Promise<string> {
  if (!mb.tokensEncrypted) throw new Error("Mailbox has no tokens");
  const t = decryptJson<Tokens>(mb.tokensEncrypted);
  if (t.expires_at - 60_000 > Date.now()) return t.access_token;
  if (!t.refresh_token) throw new MailboxAuthError("Mailbox token expired; reconnect it");
  const provider = mb.provider as "gmail" | "outlook";
  const r = await tokenRequest(provider, { grant_type: "refresh_token", refresh_token: t.refresh_token, ...(provider === "outlook" ? { scope: MS_SCOPES.join(" ") } : {}) });
  const next: Tokens = { access_token: r.access_token, refresh_token: r.refresh_token ?? t.refresh_token, expires_at: Date.now() + r.expires_in * 1000 };
  await db.update(mailboxes).set({ tokensEncrypted: encryptJson(next) }).where(eq(mailboxes.id, mb.id));
  return next.access_token;
}

export class MailboxAuthError extends Error {}

// ---------- sending ----------

export type OutgoingEmail = { to: string; subject: string; body: string; replyTo?: string; headers: Record<string, string> };

const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);

/** RFC 822 message, plain text UTF-8 (Arabic-safe). */
export function buildMime(from: string, m: OutgoingEmail): string {
  const lines = [
    `From: ${from}`,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (m.replyTo) lines.push(`Reply-To: ${m.replyTo}`);
  for (const [k, v] of Object.entries(m.headers)) lines.push(`${k}: ${v}`);
  const body = Buffer.from(m.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${lines.join("\r\n")}\r\n\r\n${body}`;
}

/** Sends from the mailbox. Returns the provider message id when the provider gives one. */
export async function transmit(mb: Mailbox, m: OutgoingEmail): Promise<string> {
  if (mb.provider === "demo") {
    if (process.env.NODE_ENV === "production") throw new Error("Demo mailboxes cannot send in production");
    return `demo-${randomBytes(6).toString("hex")}`; // demo mailbox: recorded, never transmitted
  }
  const token = await accessToken(mb);
  const mime = buildMime(mb.email, m);
  if (mb.provider === "gmail") {
    const res = await http("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
    });
    if (res.status === 401) throw new MailboxAuthError("Gmail rejected the token");
    if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { id: string }).id;
  }
  // Graph accepts a base64 MIME body on /sendMail, which lets us set List-Unsubscribe.
  const res = await http("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
    body: Buffer.from(mime).toString("base64"),
  });
  if (res.status === 401) throw new MailboxAuthError("Outlook rejected the token");
  if (!res.ok) throw new Error(`Outlook ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `graph-${Date.now()}`;
}
