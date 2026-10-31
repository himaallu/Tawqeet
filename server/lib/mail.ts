/**
 * Transactional email (magic links, alerts, digests, reports) through Resend.
 * On Replit the key comes from the Resend connection; elsewhere from RESEND_API_KEY / EMAIL_FROM.
 * In development with neither, emails are printed to the console.
 * Outbound prospect emails never go through here: they go from the client's own mailbox.
 */
type ResendCreds = { apiKey: string; from: string };

let cached: { creds: ResendCreds | null; at: number } | null = null;

async function replitConnection(): Promise<ResendCreds | null> {
  const host = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;
  if (!host || !token) return null;
  try {
    const res = await fetch(`https://${host}/api/v2/connection?include_secrets=true&connector_names=resend`, {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: { settings?: { api_key?: string; from_email?: string } }[] };
    const s = json.items?.[0]?.settings;
    return s?.api_key ? { apiKey: s.api_key, from: s.from_email || process.env.EMAIL_FROM || "" } : null;
  } catch {
    return null;
  }
}

export async function resendCreds(): Promise<ResendCreds | null> {
  if (process.env.RESEND_API_KEY) {
    return { apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM || "Tawqeet <onboarding@resend.dev>" };
  }
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.creds;
  const creds = await replitConnection();
  cached = { creds, at: Date.now() };
  return creds;
}

export type Mail = { to: string | string[]; subject: string; text: string; html?: string; replyTo?: string };

/** Sent mail in dev-console mode, so tests can read magic links. */
export const devOutbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<void> {
  const creds = await resendCreds();
  if (!creds) {
    if (process.env.NODE_ENV === "production") throw new Error("Resend is not configured");
    devOutbox.push(mail);
    if (devOutbox.length > 200) devOutbox.shift();
    if (process.env.NODE_ENV !== "test") {
      console.log(`\n[mail] to ${[mail.to].flat().join(", ")} — ${mail.subject}\n${mail.text}\n`);
    }
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${creds.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: creds.from,
      to: [mail.to].flat(),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      reply_to: mail.replyTo,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minimal branded wrapper for system emails. `dir="auto"` keeps Arabic right-to-left. */
export function layoutHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Roboto,'IBM Plex Sans Arabic',sans-serif;color:#1a1814">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-weight:600;letter-spacing:-.01em;margin-bottom:24px">Tawqeet <span style="color:#8a847a">توقيت</span></div>
<div style="background:#fff;border:1px solid #e7e3da;border-radius:14px;padding:24px" dir="auto">
<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>${bodyHtml}</div>
<p style="color:#8a847a;font-size:12px;margin-top:16px">Sent by Tawqeet.</p></div></body></html>`;
}
