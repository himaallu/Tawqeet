import { sql } from "drizzle-orm";
import { db } from "../db";
import { activeProvider } from "./ai";
import { encryptionKeyValid } from "./crypto";
import { resendCreds } from "./mail";

/** Settings › System check. Reports whether each setting is present and usable — never its value. */
export type Check = { key: string; label: string; group: string; ok: boolean; required: boolean; detail: string };

const set = (name: string) => Boolean(process.env[name]?.trim());

function env(group: string, key: string, label: string, required: boolean, missing: string): Check {
  return { key, label, group, ok: set(key), required, detail: set(key) ? "Set" : `Missing — ${missing}` };
}

function all(group: string, keys: string[], label: string, required: boolean, missing: string): Check {
  const absent = keys.filter((k) => !set(k));
  return {
    key: keys.join(" · "),
    label,
    group,
    ok: absent.length === 0,
    required,
    detail: absent.length === 0 ? "Set" : `Missing ${absent.join(", ")} — ${missing}`,
  };
}

export async function runSystemCheck(): Promise<Check[]> {
  const checks: Check[] = [];

  try {
    await db.execute(sql`select 1`);
    checks.push({ key: "DATABASE_URL", label: "Database", group: "Core", ok: true, required: true, detail: "Connected" });
  } catch (e) {
    checks.push({ key: "DATABASE_URL", label: "Database", group: "Core", ok: false, required: true, detail: `Connection failed: ${(e as Error).message}` });
  }
  try {
    const r = await db.execute<{ n: number; last: string | null }>(
      sql`select count(*)::int as n, (select max(created_on)::text from pgboss.job where state = 'completed') as last from pgboss.schedule`,
    );
    const n = r.rows[0]?.n ?? 0;
    checks.push({
      key: "WORKER",
      label: "Background worker",
      group: "Core",
      ok: n >= 6,
      required: true,
      detail: n >= 6 ? `${n} schedules registered` : `${n} schedules — start the worker (npm run worker)`,
    });
  } catch {
    checks.push({ key: "WORKER", label: "Background worker", group: "Core", ok: false, required: true, detail: "Not started yet — run npm run worker" });
  }
  checks.push(env("Core", "APP_URL", "Public app URL", true, "links in emails and OAuth redirects may be wrong"));
  checks.push({
    key: "ENCRYPTION_KEY",
    label: "Encryption key",
    group: "Core",
    ok: encryptionKeyValid(),
    required: true,
    detail: encryptionKeyValid() ? "Set (32 bytes)" : set("ENCRYPTION_KEY") ? "Set, but must be 32 bytes base64" : "Missing — mailbox tokens can't be stored",
  });

  const resend = await resendCreds();
  checks.push({
    key: "RESEND_API_KEY",
    label: "Resend (magic links, alerts)",
    group: "Email",
    ok: !!resend,
    required: true,
    detail: resend ? (set("RESEND_API_KEY") ? "Set" : "Using Replit's Resend connection") : "Missing — connect Resend in Replit or set RESEND_API_KEY",
  });
  checks.push(env("Email", "EMAIL_FROM", "Sender address", false, "falls back to the Resend connection's address"));
  checks.push(env("Email", "INBOUND_DOMAIN", "Reply-tracking domain", false, "replies can't be detected automatically"));
  checks.push(env("Email", "INBOUND_WEBHOOK_SECRET", "Inbound webhook secret", false, "inbound webhook is disabled"));

  const p = activeProvider();
  checks.push({
    key: "GEMINI_API_KEY · ANTHROPIC_API_KEY · OPENAI_API_KEY",
    label: "AI provider",
    group: "AI & data",
    ok: !!p,
    required: true,
    detail: p ? `Using ${p}` : "No key — running on offline demo logic",
  });
  checks.push(env("AI & data", "LEADOCEAN_API_KEY", "LeadOcean (find people)", true, "contacts use offline demo data"));
  checks.push(env("AI & data", "FIRECRAWL_API_KEY", "Firecrawl (JS pages)", false, "pages that need JavaScript are skipped"));

  checks.push(all("Mailboxes", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], "Gmail (send-only OAuth)", false, "Gmail mailboxes can't connect"));
  checks.push(all("Mailboxes", ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"], "Outlook (send-only OAuth)", false, "Outlook mailboxes can't connect"));

  checks.push(all("Alerts", ["TWILIO_SID", "TWILIO_TOKEN", "TWILIO_FROM"], "Twilio SMS", false, "SMS alerts are off"));
  checks.push(all("Integrations", ["HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"], "HubSpot CRM import", false, "CRM import shows \"coming soon\""));

  checks.push(
    all("Billing", ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_AGENCY", "STRIPE_PRICE_EXTRA_CLIENT", "STRIPE_PRICE_SIM_PACK"], "Stripe billing", false, "checkout is disabled"),
  );
  return checks;
}
