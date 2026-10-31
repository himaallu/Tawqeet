import "../server/lib/load-env";
import { sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Health check for every external key: `npm run check:keys` (add `--paid` to also spend
 * 2 LeadOcean records verifying the person-field mapping). Uses the cheapest call that proves
 * each key works. Never prints a key's value.
 */
type Result = { name: string; status: "ok" | "fail" | "warn" | "skip"; detail: string };
const results: Result[] = [];
const env = (k: string) => process.env[k]?.trim() || "";
const has = (...ks: string[]) => ks.every((k) => env(k));
const PAID = process.argv.includes("--paid");

async function check(name: string, needs: string[], fn: () => Promise<Omit<Result, "name">>) {
  if (!has(...needs)) {
    results.push({ name, status: "skip", detail: `not set (${needs.filter((k) => !env(k)).join(", ")})` });
    return;
  }
  try {
    results.push({ name, ...(await fn()) });
  } catch (e) {
    results.push({ name, status: "fail", detail: (e as Error).message.slice(0, 300) });
  }
}

async function get(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, ok: res.ok, json, text };
}

const errMsg = (r: { status: number; json: any; text: string }) =>
  `HTTP ${r.status}: ${String(r.json?.error?.message ?? r.json?.message ?? r.json?.error ?? r.text).slice(0, 200)}`;

// ---------------------------------------------------------------- core

await check("Database", ["DATABASE_URL"], async () => {
  const { db, pool } = await import("../server/db");
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from agencies`);
  await pool.end();
  return { status: "ok", detail: `connected · ${r.rows[0].n} agencies` };
});

await check("Encryption key", ["ENCRYPTION_KEY"], async () => {
  const n = Buffer.from(env("ENCRYPTION_KEY"), "base64").length;
  return n === 32 ? { status: "ok", detail: "32 bytes" } : { status: "fail", detail: `decodes to ${n} bytes, needs 32` };
});

await check("App URL", ["APP_URL"], async () => {
  const u = new URL(env("APP_URL"));
  const local = /localhost|127\.0\.0\.1/.test(u.host);
  return { status: local ? "warn" : "ok", detail: local ? `${u.origin} — fine locally; OAuth + email links need a public URL` : u.origin };
});

// ---------------------------------------------------------------- AI

await check("Gemini", ["GEMINI_API_KEY"], async () => {
  const r = await get(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${env("GEMINI_API_KEY")}`);
  if (!r.ok) return { status: "fail", detail: errMsg(r) };
  const names: string[] = r.json.models.map((m: { name: string }) => m.name.replace("models/", ""));
  const want = [env("AI_MODEL") || "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const missing = want.filter((m) => !names.includes(m));
  if (missing.length) return { status: "fail", detail: `key works, but model(s) not available: ${missing.join(", ")}` };
  return { status: "ok", detail: `key valid · ${want.join(" + ")} available` };
});

await check("Anthropic", ["ANTHROPIC_API_KEY"], async () => {
  const r = await get("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" } });
  if (!r.ok) return { status: "fail", detail: errMsg(r) };
  const ids: string[] = r.json.data.map((m: { id: string }) => m.id);
  const want = ["claude-sonnet-5-5", "claude-haiku-5-5"];
  const missing = want.filter((m) => !ids.some((id) => id.startsWith(m)));
  return missing.length ? { status: "warn", detail: `key valid; not listed: ${missing.join(", ")}` } : { status: "ok", detail: "key valid · models available" };
});

await check("OpenAI", ["OPENAI_API_KEY"], async () => {
  const r = await get("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${env("OPENAI_API_KEY")}` } });
  if (!r.ok) return { status: "fail", detail: errMsg(r) };
  const ids: string[] = r.json.data.map((m: { id: string }) => m.id);
  const missing = ["gpt-5-mini", "gpt-5-nano"].filter((m) => !ids.includes(m));
  return missing.length ? { status: "warn", detail: `key valid; not listed: ${missing.join(", ")}` } : { status: "ok", detail: "key valid · models available" };
});

// One real structured call through the app's own gateway (fractions of a cent).
if (has("GEMINI_API_KEY") || has("ANTHROPIC_API_KEY") || has("OPENAI_API_KEY")) {
  await check("AI gateway (live call)", [], async () => {
    const { activeProvider, aiObject } = await import("../server/lib/ai");
    const started = Date.now();
    const out = await aiObject({
      agencyId: null,
      purpose: "health.check",
      tier: "fast",
      schema: z.object({ capital: z.string() }),
      prompt: "What is the capital of the UAE? Answer with the city name only.",
      offline: () => ({ capital: "offline" }),
    });
    const { pool } = await import("../server/db");
    await pool.end().catch(() => undefined);
    const ok = /abu dhabi/i.test(out.capital);
    return { status: ok ? "ok" : "warn", detail: `${activeProvider()} answered "${out.capital}" in ${Date.now() - started}ms · logged to ai_usage` };
  });
}

// ---------------------------------------------------------------- email

await check("Resend", ["RESEND_API_KEY"], async () => {
  const r = await get("https://api.resend.com/domains", { headers: { authorization: `Bearer ${env("RESEND_API_KEY")}` } });
  if (r.status === 401 && /restricted/i.test(r.text)) {
    return { status: "warn", detail: "key valid but sending-only — can't list domains; make sure EMAIL_FROM's domain is verified in Resend" };
  }
  if (!r.ok) return { status: "fail", detail: errMsg(r) };
  const domains: { name: string; status: string }[] = r.json.data ?? [];
  const fromDomain = env("EMAIL_FROM").match(/@([^>\s]+)/)?.[1]?.toLowerCase();
  if (!fromDomain) return { status: "warn", detail: `key valid · domains: ${domains.map((d) => `${d.name} (${d.status})`).join(", ") || "none"} · EMAIL_FROM not set` };
  const d = domains.find((x) => x.name.toLowerCase() === fromDomain);
  if (!d) return { status: "fail", detail: `key valid, but ${fromDomain} (from EMAIL_FROM) isn't added in Resend` };
  return d.status === "verified" ? { status: "ok", detail: `key valid · ${fromDomain} verified` } : { status: "fail", detail: `${fromDomain} is "${d.status}" — finish DNS verification in Resend` };
});

// ---------------------------------------------------------------- LeadOcean

const LO = "https://api.leadocean.io";
const lo = (path: string, body?: unknown) =>
  get(`${LO}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-api-key": env("LEADOCEAN_API_KEY"), accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

await check("LeadOcean · key + account", ["LEADOCEAN_API_KEY"], async () => {
  const r = await lo("/v1/account");
  if (!r.ok) return { status: "fail", detail: errMsg(r) };
  const d = r.json.data ?? r.json;
  const flat = JSON.stringify(d);
  const pick = (re: RegExp) => flat.match(re)?.[1];
  const plan = pick(/"plan(?:Name)?":"([^"]+)"/);
  const left = pick(/"(?:recordsLeft|records_left|remaining)":(\d+)/);
  return { status: "ok", detail: `authenticated${plan ? ` · plan ${plan}` : ""}${left ? ` · ${Number(left).toLocaleString()} records left` : ""}` };
});

await check("LeadOcean · usage", ["LEADOCEAN_API_KEY"], async () => {
  const r = await lo("/v1/usage");
  if (!r.ok) return { status: "warn", detail: errMsg(r) };
  const flat = JSON.stringify(r.json.data ?? r.json);
  const used = flat.match(/"(?:used|recordsUsed|records_used|total)":(\d+)/)?.[1];
  return { status: "ok", detail: used ? `${Number(used).toLocaleString()} records used this month` : "readable" };
});

// Free sizing calls (count + limit=1) with the exact filters the app sends.
const gulfQueries = [
  { label: "UAE · Head of Logistics / VP Supply Chain", filter: { country: ["AE"], title: ["Head of Logistics", "VP Supply Chain"], emailStatus: ["verified", "catch_all_valid"], hasEmail: true } },
  { label: "KSA · HR Director / Chief People Officer", filter: { country: ["SA"], title: ["HR Director", "Chief People Officer"], emailStatus: ["verified", "catch_all_valid"], hasEmail: true } },
  { label: "domain filter (emiratesnbd.com) · any title", filter: { domain: ["emiratesnbd.com"], emailStatus: ["verified", "catch_all_valid"], hasEmail: true } },
];
for (const q of gulfQueries) {
  await check(`LeadOcean · ${q.label}`, ["LEADOCEAN_API_KEY"], async () => {
    const r = await lo("/v1/people/search", { ...q.filter, count: true, limit: 1 });
    if (!r.ok) return { status: "fail", detail: errMsg(r) };
    const m = r.json.meta ?? {};
    const unsupported: unknown[] = m.unsupportedFilters ?? [];
    if (unsupported.length) return { status: "fail", detail: `filters ignored by LeadOcean: ${JSON.stringify(unsupported)}` };
    const total = m.total ?? m.count;
    return { status: total ? "ok" : "warn", detail: `${total === null || total === undefined ? "?" : Number(total).toLocaleString()} verified-email matches · free sizing call (countOnly=${m.countOnly ?? "?"}, credits ${m.credits ?? 0})` };
  });
}

await check("LeadOcean · company enrich", ["LEADOCEAN_API_KEY"], async () => {
  const r = await lo("/v1/companies/enrich?domain=emiratesnbd.com");
  if (r.status === 404) return { status: "warn", detail: "endpoint reachable; test company not found" };
  if (!r.ok) return { status: "fail", detail: errMsg(r) };
  const d = r.json.data?.company_data ?? {};
  const keys = Object.keys(d);
  const name = d.company_name ?? d.name;
  return { status: "ok", detail: `${name ?? "company"} · fields: ${keys.slice(0, 12).join(", ")}${keys.length > 12 ? "…" : ""} · credits ${r.json.meta?.credits ?? "?"}` };
});

if (PAID) {
  // Spends 2 records: one search row + one enrich, to confirm the person-field names the adapter maps.
  await check("LeadOcean · person fields (2 records)", ["LEADOCEAN_API_KEY"], async () => {
    const s = await lo("/v1/people/search", { ...gulfQueries[0].filter, limit: 1 });
    if (!s.ok) return { status: "fail", detail: errMsg(s) };
    const row = s.json.data?.[0];
    if (!row) return { status: "warn", detail: "no row returned" };
    const personId = row.meta?.source_ids?.person_id;
    const e = await lo(`/v1/people/enrich?person_id=${encodeURIComponent(personId)}&reveal_email=true`);
    if (!e.ok) return { status: "fail", detail: errMsg(e) };
    const p = e.json.data?.profile_data ?? {};
    const emails: { type?: string; status?: string }[] = e.json.data?.contact_data?.contact_emails ?? [];
    const mapped = {
      name: ["profile_full_name", "full_name", "name"].find((k) => p[k]),
      title: ["profile_job_title", "profile_headline", "job_title", "title"].find((k) => p[k]),
      linkedin: ["profile_linkedin_url", "linkedin_url"].find((k) => p[k]),
    };
    const unmapped = Object.entries(mapped).filter(([, v]) => !v).map(([k]) => k);
    return {
      status: unmapped.length ? "warn" : "ok",
      detail: `profile keys: ${Object.keys(p).join(", ")} · emails: ${emails.map((x) => `${x.type}/${x.status}`).join(", ") || "none"}${unmapped.length ? ` · NOT MAPPED: ${unmapped.join(", ")}` : " · all fields mapped"}`,
    };
  });
}

// ---------------------------------------------------------------- data + integrations

await check("Firecrawl", ["FIRECRAWL_API_KEY"], async () => {
  const r = await get("https://api.firecrawl.dev/v2/team/credit-usage", { headers: { authorization: `Bearer ${env("FIRECRAWL_API_KEY")}` } });
  if (!r.ok) return { status: "fail", detail: errMsg(r) };
  const left = r.json.data?.remainingCredits ?? r.json.data?.remaining_credits;
  return { status: "ok", detail: `key valid${left !== undefined ? ` · ${left} credits left` : ""}` };
});

const oauthProbe = async (url: string, badPatterns: RegExp) => {
  const r = await get(url, { redirect: "follow" });
  const m = r.text.match(badPatterns);
  return m ? { status: "fail" as const, detail: `provider rejected the client: ${m[0]}` } : { status: "ok" as const, detail: "client ID recognised (secret is verified on first real sign-in)" };
};

await check("Google OAuth (Gmail send)", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], async () => {
  const q = new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: `${env("APP_URL")}/api/oauth/gmail/callback`, response_type: "code", scope: "https://www.googleapis.com/auth/gmail.send openid email" });
  return oauthProbe(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, /invalid_client|redirect_uri_mismatch|deleted_client|disabled_client/);
});

await check("Microsoft OAuth (Outlook send)", ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"], async () => {
  const q = new URLSearchParams({ client_id: env("MICROSOFT_CLIENT_ID"), redirect_uri: `${env("APP_URL")}/api/oauth/outlook/callback`, response_type: "code", scope: "openid email offline_access https://graph.microsoft.com/Mail.Send" });
  return oauthProbe(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`, /AADSTS\d+/);
});

await check("Twilio", ["TWILIO_SID", "TWILIO_TOKEN"], async () => {
  const r = await get(`https://api.twilio.com/2010-04-01/Accounts/${env("TWILIO_SID")}.json`, {
    headers: { authorization: `Basic ${Buffer.from(`${env("TWILIO_SID")}:${env("TWILIO_TOKEN")}`).toString("base64")}` },
  });
  if (!r.ok) return { status: "fail", detail: errMsg(r) };
  const from = env("TWILIO_FROM");
  return { status: r.json.status === "active" && from ? "ok" : "warn", detail: `account ${r.json.status} (${r.json.type})${from ? "" : " · TWILIO_FROM not set"}` };
});

await check("Stripe", ["STRIPE_SECRET_KEY"], async () => {
  const auth = { authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` };
  const bal = await get("https://api.stripe.com/v1/balance", { headers: auth });
  if (!bal.ok) return { status: "fail", detail: errMsg(bal) };
  const mode = env("STRIPE_SECRET_KEY").startsWith("sk_live") ? "LIVE" : "test";
  const notes: string[] = [`${mode} mode`];
  let bad = false;
  for (const k of ["STRIPE_PRICE_AGENCY", "STRIPE_PRICE_EXTRA_CLIENT", "STRIPE_PRICE_SIM_PACK"]) {
    if (!env(k)) {
      notes.push(`${k} missing`);
      bad = true;
      continue;
    }
    const p = await get(`https://api.stripe.com/v1/prices/${env(k)}`, { headers: auth });
    if (!p.ok) {
      notes.push(`${k}: ${errMsg(p)}`);
      bad = true;
      continue;
    }
    const recurring = p.json.recurring ? `/${p.json.recurring.interval}` : " one-time";
    notes.push(`${k.replace("STRIPE_PRICE_", "").toLowerCase()} ${(p.json.unit_amount / 100).toFixed(0)} ${String(p.json.currency).toUpperCase()}${recurring}${p.json.active ? "" : " (INACTIVE)"}`);
    if (!p.json.active) bad = true;
  }
  if (!env("STRIPE_WEBHOOK_SECRET").startsWith("whsec_")) {
    notes.push("STRIPE_WEBHOOK_SECRET missing or not whsec_…");
    bad = true;
  }
  return { status: bad ? "warn" : "ok", detail: notes.join(" · ") };
});

await check("Inbound reply tracking", ["INBOUND_DOMAIN", "INBOUND_WEBHOOK_SECRET"], async () => {
  const { resolveMx } = await import("node:dns/promises");
  const mx = await resolveMx(env("INBOUND_DOMAIN")).catch(() => []);
  if (!mx.length) return { status: "fail", detail: `${env("INBOUND_DOMAIN")} has no MX record — point it at your inbound provider` };
  return { status: env("INBOUND_WEBHOOK_SECRET").length >= 16 ? "ok" : "warn", detail: `MX → ${mx.map((m) => m.exchange).join(", ")}${env("INBOUND_WEBHOOK_SECRET").length < 16 ? " · use a longer webhook secret" : ""}` };
});

await check("HubSpot", ["HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"], async () => ({ status: "ok", detail: "set (verified on first real connect)" }));

// ---------------------------------------------------------------- report

const icon = { ok: "✅", fail: "❌", warn: "⚠️ ", skip: "–  " };
const width = Math.max(...results.map((r) => r.name.length));
console.log("");
for (const r of results) console.log(`${icon[r.status]} ${r.name.padEnd(width)}  ${r.detail}`);
const counts = Object.fromEntries((["ok", "warn", "fail", "skip"] as const).map((s) => [s, results.filter((r) => r.status === s).length]));
console.log(`\n${counts.ok} ok · ${counts.warn} warnings · ${counts.fail} failed · ${counts.skip} not set${PAID ? "" : " · run with --paid to verify LeadOcean person fields (2 records)"}`);
process.exit(counts.fail ? 1 : 0);
