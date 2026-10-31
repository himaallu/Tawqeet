import { sql } from "drizzle-orm";
import { z } from "zod";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { db } from "@workspace/db";
import { sendEmail, demoRecipient } from "./resend";

export type CheckStatus = "pass" | "fail" | "skip";
export type ServiceCheck = { key: string; label: string; status: CheckStatus; detail: string };

/** Required env vars for the app to run. Values are never returned. */
export const REQUIRED_ENV = ["DATABASE_URL", "SESSION_SECRET", "OWNER_EMAIL", "RESEND_FROM_EMAIL"] as const;
export const missingRequired = () => [...REQUIRED_ENV.filter(k => !process.env[k]),
  ...(!process.env.APP_URL && !process.env.REPLIT_DEV_DOMAIN ? ["APP_URL"] : [])];

const timeout = (ms = 15000) => AbortSignal.timeout(ms);
const safe = (e: unknown) => (e instanceof Error ? e.message : "failed").replace(/(key|token|secret)=[^&\s]+/gi, "$1=***").slice(0, 160);

async function run(key: string, label: string, configured: boolean, fn: () => Promise<string>): Promise<ServiceCheck> {
  if (!configured) return { key, label, status: "skip", detail: "Not configured." };
  try { return { key, label, status: "pass", detail: await fn() }; }
  catch (e) { return { key, label, status: "fail", detail: safe(e) }; }
}
async function http(url: string, init: RequestInit = {}, ok = (r: Response) => r.ok) {
  const r = await fetch(url, { ...init, signal: timeout() });
  if (!ok(r)) throw new Error(`HTTP ${r.status}`);
  return r;
}

/** Live, minimal calls to each configured service. `active` also sends a test email and webhook POST. */
export async function runServiceChecks(opts: { active: boolean }): Promise<ServiceCheck[]> {
  const env = process.env;
  const provider = env.AI_PROVIDER || (env.GEMINI_API_KEY ? "gemini" : env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
  const aiKey = provider === "gemini" ? env.GEMINI_API_KEY : provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const tiny = z.object({ ok: z.string() });
  const checks = await Promise.all([
    run("DATABASE_URL", "Database", Boolean(env.DATABASE_URL), async () => { await db.execute(sql`select 1`); return "Query succeeded."; }),
    run("AI_PROVIDER", `AI provider (${provider})`, Boolean(aiKey && env.AI_MODEL), async () => {
      const model = provider === "gemini" ? createGoogleGenerativeAI({ apiKey: aiKey })(env.AI_MODEL!)
        : provider === "anthropic" ? createAnthropic({ apiKey: aiKey })(env.AI_MODEL!) : createOpenAI({ apiKey: aiKey })(env.AI_MODEL!);
      await generateObject({ model, schema: tiny, prompt: 'Return {"ok":"yes"}.', maxRetries: 0, abortSignal: timeout(30000) });
      return `Tiny generation succeeded (${env.AI_MODEL}).`;
    }),
    run("GEMINI_API_KEY", "Gemini summary", Boolean(env.GEMINI_API_KEY), async () => {
      const m = env.GEMINI_SUMMARY_MODEL || "gemini-3.5-flash";
      await generateObject({ model: createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY })(m), schema: z.object({ summary: z.string() }),
        prompt: "Summarize in one sentence: 'Hello, can we talk next week?'", maxRetries: 0, abortSignal: timeout(30000) });
      return `Summary generated (${m}).`;
    }),
    run("LEADOCEAN_API_KEY", "LeadOcean", Boolean(env.LEADOCEAN_API_KEY), async () => {
      await http("https://api.leadocean.io/v1/people/search?count=true&limit=1", { method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.LEADOCEAN_API_KEY! }, body: JSON.stringify({ q: "test", limit: 1, count: true }) });
      return "Search API reachable.";
    }),
    run("RESEND", "Resend email", Boolean(env.RESEND_FROM_EMAIL && demoRecipient()), async () => {
      if (!opts.active) return "Configured (test email is sent by pnpm run check:env).";
      await sendEmail({ to: demoRecipient()!, subject: "Tawqeet check:env test", text: "Resend delivery test from pnpm run check:env." });
      return "Test email sent to the alert recipient.";
    }),
    run("ALERT_WEBHOOK_URL", "Alert webhook (Make)", Boolean(env.ALERT_WEBHOOK_URL), async () => {
      if (!opts.active) return "Configured (test POST is sent by pnpm run check:env or Send test alert).";
      await http(env.ALERT_WEBHOOK_URL!, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ test: true, company: "Sample Co", lead: "Sample Contact", score: 82, temperature: "hot" }) });
      return "Test payload accepted.";
    }),
    run("STRIPE_PAYMENT_LINK", "Stripe Payment Link", Boolean(env.STRIPE_PAYMENT_LINK), async () => {
      await http(env.STRIPE_PAYMENT_LINK!, { method: "GET", redirect: "follow" }, r => r.status < 400); return "Link reachable.";
    }),
    run("HUBSPOT_TOKEN", "HubSpot", Boolean(env.HUBSPOT_TOKEN), async () => {
      await http("https://api.hubapi.com/crm/v3/objects/companies?limit=1", { headers: { authorization: `Bearer ${env.HUBSPOT_TOKEN}` } }); return "Companies read OK.";
    }),
    run("FIRECRAWL_API_KEY", "Firecrawl", Boolean(env.FIRECRAWL_API_KEY), async () => {
      await http("https://api.firecrawl.dev/v1/team/credit-usage", { headers: { authorization: `Bearer ${env.FIRECRAWL_API_KEY}` } }); return "API key accepted.";
    }),
    run("TRELLO", "Trello (direct)", Boolean(env.TRELLO_KEY && env.TRELLO_TOKEN && env.TRELLO_LIST_ID), async () => {
      await http(`https://api.trello.com/1/lists/${env.TRELLO_LIST_ID}?key=${env.TRELLO_KEY}&token=${env.TRELLO_TOKEN}`); return "List reachable.";
    }),
    run("TWILIO", "Twilio SMS (direct)", Boolean(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM && env.ALERT_SMS_TO), async () => {
      await http(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}.json`, { headers: { authorization: `Basic ${Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString("base64")}` } });
      return "Account reachable.";
    }),
    run("ASANA", "Asana (direct)", Boolean(env.ASANA_TOKEN && env.ASANA_PROJECT_ID), async () => {
      await http(`https://app.asana.com/api/1.0/projects/${env.ASANA_PROJECT_ID}`, { headers: { authorization: `Bearer ${env.ASANA_TOKEN}` } }); return "Project reachable.";
    }),
    run("CLICKUP", "ClickUp (direct)", Boolean(env.CLICKUP_TOKEN && env.CLICKUP_LIST_ID), async () => {
      await http(`https://api.clickup.com/api/v2/list/${env.CLICKUP_LIST_ID}`, { headers: { authorization: env.CLICKUP_TOKEN! } }); return "List reachable.";
    }),
  ]);
  return checks;
}
