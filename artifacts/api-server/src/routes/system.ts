import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, workerHeartbeat } from "@workspace/db";
import { GetSystemCheckResponse } from "@workspace/api-zod";
import { requireOwner, requireUser } from "../lib/security";
import { appOrigin } from "../lib/config";
import { checkResend } from "../lib/resend";
import { aiConfiguration } from "../lib/brain/extract";
import { hubspotConfigured } from "../lib/brain/crm";
import { runServiceChecks, missingRequired } from "../lib/service-checks";
const router: IRouter = Router();

router.get("/settings/system", requireUser, requireOwner, async (_req, res): Promise<void> => {
  type Category = "core" | "email" | "ai" | "optional";
  const checks: { key: string; label: string; category: Category; ok: boolean; required: boolean; detail: string }[] = [];
  const add = (key: string, label: string, category: Category, required: boolean, ok: boolean, detail: string) => checks.push({ key, label, category, required, ok, detail });
  let database = false;
  try { await db.execute(sql`select 1`); database = true; } catch { /* explicit unhealthy check */ }
  add("DATABASE_URL", "PostgreSQL database", "core", true, database, database ? "Connected. Database query succeeded." : "Database connection failed.");
  const sessionOk = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
  add("SESSION_SECRET", "Session secret", "core", true, sessionOk, sessionOk ? "Configured; at least 32 characters." : "Missing or too short. Use at least 32 random characters.");
  let originOk = false;
  try { appOrigin(); originOk = true; } catch { /* no URL disclosed */ }
  add("APP_URL", "Application URL", "core", true, originOk, originOk ? (process.env.APP_URL ? "Configured with a trusted origin." : "Using the development preview origin. Set APP_URL before publishing.") : "Missing or invalid. Configure a trusted HTTPS application URL.");
  const ownerOk = Boolean(process.env.OWNER_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.OWNER_EMAIL));
  add("OWNER_EMAIL", "Agency owner email", "core", true, ownerOk, ownerOk ? "Configured. Only this address can claim the owner account." : "Missing. Set the agency owner's email to enable initial login.");
  const resend = await checkResend();
  add("RESEND_CONNECTION", "Resend connection", "email", true, resend.ok, resend.detail);
  const senderOk = Boolean(process.env.RESEND_FROM_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.RESEND_FROM_EMAIL));
  add("RESEND_FROM_EMAIL", "Magic-link sender", "email", true, senderOk, senderOk
    ? process.env.RESEND_FROM_EMAIL?.endsWith("@resend.dev")
      ? "Resend test sender configured. Delivery is restricted to the Resend account owner's address. Use a verified domain for other users."
      : "Configured. The sender domain must be verified in Resend."
    : "Missing. Use an address on a verified Resend domain.");
  const encryptionOk = /^[a-fA-F0-9]{64}$/.test(process.env.ENCRYPTION_KEY || "");
  add("ENCRYPTION_KEY", "OAuth token encryption", "optional", false, encryptionOk, encryptionOk ? "Configured for AES-256-GCM encryption." : "Not configured. Required before connecting mailboxes; use 64 hexadecimal characters.");
  for (const [key, label] of [["GEMINI_API_KEY", "Google Gemini"], ["ANTHROPIC_API_KEY", "Anthropic"], ["OPENAI_API_KEY", "OpenAI"]] as const) {
    add(key, label, "ai", false, Boolean(process.env[key]), process.env[key] ? "Present. Presence only; no AI request was made." : "Not configured. Optional until AI features are enabled.");
  }
  const ai = aiConfiguration();
  add("BRAIN_AI", "Brain extraction", "ai", true, ai.configured, ai.message);
  const hubspot = await hubspotConfigured();
  add("HUBSPOT_TOKEN", "HubSpot CRM access", "optional", false, hubspot, hubspot
    ? process.env.HUBSPOT_TOKEN ? "Server-side private app token configured. Read access is checked on import." : "HubSpot connection available. Import is always a human action."
    : "Connect HubSpot or add HUBSPOT_TOKEN with companies and deals read access.");
  add("PRIVATE_OBJECT_DIR", "Private document storage", "core", true, Boolean(process.env.PRIVATE_OBJECT_DIR),
    process.env.PRIVATE_OBJECT_DIR ? "Configured. Document bytes stay in private App Storage." : "Not configured. Document upload is unavailable.");
  const trigger = await db.execute(sql`select 1 from pg_trigger where tgname = 'tawqeet_reply_learning' and tgrelid = 'sends'::regclass and tgenabled <> 'D'`);
  add("BRAIN_LEARNING_TRIGGER", "Reply learning capture", "core", true, trigger.rows.length > 0,
    trigger.rows.length ? "Database trigger active. New reply classifications are captured atomically." : "Missing. Install scripts/brain-learning.sql with the schema migration.");
  for (const [key, label] of [
    ["FIRECRAWL_API_KEY", "Hosted scraper"], ["GOOGLE_CLIENT_ID", "Google OAuth client"],
    ["GOOGLE_CLIENT_SECRET", "Google OAuth secret"], ["MICROSOFT_CLIENT_ID", "Microsoft OAuth client"],
    ["MICROSOFT_CLIENT_SECRET", "Microsoft OAuth secret"], ["STRIPE_SECRET_KEY", "Stripe secret"],
    ["STRIPE_WEBHOOK_SECRET", "Stripe webhook secret"],
  ] as const) add(key, label, "optional", false, Boolean(process.env[key]), process.env[key] ? "Present. Presence only; not validated with provider." : "Not configured. Reserved for a later phase.");
  let workerOk = false;
  try {
    const [heartbeat] = await db.select().from(workerHeartbeat).where(eq(workerHeartbeat.id, "main")).limit(1);
    workerOk = Boolean(heartbeat && Date.now() - heartbeat.seenAt.getTime() < 90_000);
  } catch { /* heartbeat missing is unhealthy */ }
  add("PG_BOSS_WORKER", "Background worker", "core", true, workerOk, workerOk ? "Worker heartbeat received in the last 90 seconds. Future outbound jobs remain disabled." : "No recent heartbeat. Start the separate worker process.");
  res.set("Cache-Control", "no-store");
  res.json(GetSystemCheckResponse.parse({ checkedAt: new Date().toISOString(), checks }));
});
router.get("/settings/system/live", requireUser, requireOwner, async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  res.json({ checkedAt: new Date().toISOString(), missingRequired: missingRequired(), checks: await runServiceChecks({ active: false }) });
});
export default router;
