import { ReplitConnectors } from "@replit/connectors-sdk";
const connectors = new ReplitConnectors();

export async function sendMagicLink(email: string, url: string): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is missing.");
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Tawqeet <${from}>`, to: [email],
      subject: "Your secure sign-in link to Tawqeet",
      text: `Sign in to Tawqeet:\n\n${url}\n\nThis link expires in 15 minutes and can only be used once. If you did not request it, ignore this email.`,
      html: `<div dir="auto" style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;color:#153d35"><h1>Tawqeet</h1><h2>Your workspace is one click away.</h2><p>Confirm your sign-in using the secure link below.</p><p><a href="${url}" style="display:inline-block;padding:14px 24px;background:#174f42;color:white;border-radius:8px;text-decoration:none">Sign in to Tawqeet</a></p><p>This link expires in 15 minutes and can only be used once.</p><p>If you did not request it, you can safely ignore this email.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error("Resend delivery failed.");
}

export async function checkResend(): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await connectors.proxy("resend", "/domains", { method: "GET" });
    const result = await response.json() as { data?: { name: string; status: string }[] };
    if (!response.ok) {
      // A sending-only key is valid for magic links, but intentionally cannot list domains.
      if (response.status === 401 && (result as { name?: string }).name === "restricted_api_key") {
        return { ok: true, detail: "Connected with sending-only access. Domain verification cannot be inspected with this permission; email delivery is checked when you request a link." };
      }
      return { ok: false, detail: `Resend connection could not be verified (HTTP ${response.status}). Check Integrations.` };
    }
    const domain = process.env.RESEND_FROM_EMAIL?.split("@")[1]?.toLowerCase();
    const verified = result.data?.some(d => d.name.toLowerCase() === domain && d.status === "verified");
    return { ok: true, detail: domain
      ? verified ? "Connected. Sender domain is verified." : "Connected. Sender domain is not listed as verified; delivery may be restricted."
      : "Connected. Configure RESEND_FROM_EMAIL to enable login emails." };
  } catch {
    return { ok: false, detail: "Resend is unavailable. Check the connection in Integrations." };
  }
}
