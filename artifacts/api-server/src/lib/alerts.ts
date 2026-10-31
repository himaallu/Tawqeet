import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, leads, companies, alertsLog } from "@workspace/db";
import { leadEvidence } from "./signals/scoring";
import { sendEmail, demoRecipient } from "./resend";
import { appOrigin } from "./config";
import { audit } from "./compliance";
import { logger } from "./logger";
import { direct, sendDirect, type DirectChannel } from "./integrations";

export type AlertPayload = { company: string; lead: string; title: string; score: number; temperature: string;
  why_now: string; signals: { name: string; title: string; url: string | null; points: number }[]; evidence_url: string | null;
  dashboard_url: string; test?: boolean };
export const CHANNELS = ["email", "sms", "trello", "asana", "clickup", "webhook"] as const;
export type Channel = typeof CHANNELS[number];

const dashboard = (leadId?: string) => {
  let origin = "";
  try { origin = appOrigin(); } catch { /* unset in local runs */ }
  return `${origin}${leadId ? `/leads/${leadId}` : "/review"}`;
};

export async function postWebhook(payload: AlertPayload, channel: Channel) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) throw new Error("ALERT_WEBHOOK_URL is not configured.");
  const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, channel }) });
  if (!r.ok) throw new Error(`Webhook HTTP ${r.status}`);
}
export async function emailAlert(payload: AlertPayload) {
  const to = demoRecipient();
  if (!to) throw new Error("ALERT_EMAIL_TO / OWNER_EMAIL is not configured.");
  const lines = [`${payload.lead} · ${payload.title} · ${payload.company}`, `Score ${payload.score}/100 (${payload.temperature})`,
    `Why now: ${payload.why_now}`, "", "Signals:", ...payload.signals.map(s => `• ${s.name}: ${s.title}${s.url ? ` (${s.url})` : ""}`),
    "", `Open in Tawqeet: ${payload.dashboard_url}`];
  await sendEmail({ to, subject: `${payload.test ? "[Test] " : ""}Hot lead: ${payload.company} — ${payload.lead} (${payload.score})`, text: lines.join("\n") });
}

async function deliver(agencyId: string, payload: AlertPayload, channel: Channel, leadId: string | null, test: boolean) {
  let status = "sent", error: string | null = null;
  try {
    if (channel === "email") await emailAlert(payload);
    else if (channel !== "webhook" && direct[channel as DirectChannel]()) await sendDirect(channel as DirectChannel, payload);
    else await postWebhook(payload, channel);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delivery failed";
    status = /not configured/.test(message) ? "skipped" : "failed"; error = message.slice(0, 300);
  }
  await db.insert(alertsLog).values({ agencyId, leadId, channel, status, error, score: payload.score, test: test ? "test" : null });
  await audit(agencyId, null, test ? "alert.test" : "alert.send", `${channel}: ${payload.company} — ${payload.lead}`, { status, error });
  return { status, error };
}

export async function testAlert(agencyId: string, channel: Channel) {
  const payload: AlertPayload = { company: "Sample Co", lead: "Sample Contact", title: "Head of Growth", score: 82, temperature: "hot",
    why_now: "Test alert from Tawqeet: funding round plus sales hiring.", signals: [{ name: "Funding round", title: "Sample Co raises Series A", url: null, points: 30 }],
    evidence_url: null, dashboard_url: dashboard(), test: true };
  return deliver(agencyId, payload, channel, null, true);
}

/** Alert newly Hot leads once per 7 days unless the score rose by 15+ since the last alert. Never throws. */
export async function notifyHotLeads(agencyId: string, warn?: (s: string) => void) {
  try {
    const evidence = await leadEvidence(agencyId);
    const hot = evidence.filter(e => e.totalScore >= 70);
    if (!hot.length) return;
    const ids = hot.map(h => h.id);
    const [rows, history] = await Promise.all([
      db.select({ lead: leads, company: companies }).from(leads).innerJoin(companies, eq(companies.id, leads.companyId))
        .where(and(eq(leads.agencyId, agencyId), inArray(leads.id, ids))),
      db.select().from(alertsLog).where(and(eq(alertsLog.agencyId, agencyId), inArray(alertsLog.leadId, ids),
        gte(alertsLog.createdAt, new Date(Date.now() - 7 * 86_400_000)))).orderBy(desc(alertsLog.createdAt)),
    ]);
    // Make webhook stays the default fan-out; direct integrations add channels only when configured.
    const channels: Channel[] = ["email", "webhook", ...(Object.keys(direct) as DirectChannel[]).filter(c => direct[c]())];
    for (const e of hot) {
      const row = rows.find(r => r.lead.id === e.id);
      if (!row) continue;
      // Dedupe on delivered alerts; retry failed/unconfigured channels at most every 10 minutes.
      const last = history.find(h => h.leadId === e.id && !h.test && h.status === "sent");
      if (last && e.totalScore < (last.score ?? 0) + 15) continue;
      if (!last && history.some(h => h.leadId === e.id && !h.test && h.createdAt.getTime() > Date.now() - 10 * 60_000)) continue;
      const signals = [...e.signals].sort((a, b) => b.points - a.points);
      const payload: AlertPayload = { company: row.company.name, lead: row.lead.fullName, title: row.lead.title || "",
        score: e.totalScore, temperature: "hot", why_now: signals.slice(0, 2).map(s => `${s.name}: ${s.title}`).join("; ") || row.lead.whyNow || "",
        signals: signals.slice(0, 5).map(s => ({ name: s.name, title: s.title, url: s.url, points: s.points })),
        evidence_url: signals.find(s => s.url)?.url ?? null, dashboard_url: dashboard(e.id) };
      for (const c of channels) {
        const r = await deliver(agencyId, payload, c, e.id, false);
        if (r.status === "failed") warn?.(`${row.company.name}: ${c} alert failed (${r.error}).`);
      }
    }
  } catch (err) {
    logger.warn({ errorName: err instanceof Error ? err.name : "Unknown" }, "Hot lead alerts failed");
    warn?.("Hot lead alerts could not be processed; leads are unaffected.");
  }
}
