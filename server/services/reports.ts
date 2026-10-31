import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { agencies, alertRules, clients, companies, drafts, leads, leadSignals, plays, sends, signalDefinitions, signals, users } from "../db/schema";
import { isFirstWorkdayOfWeek, offsetMinutes } from "../lib/gulf-time";
import { escapeHtml, sendMail } from "../lib/mail";

/** White-label weekly report + calibration (score vs. real replies). */

export async function weeklyReport(agencyId: string, clientId: string, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const where = and(eq(sends.agencyId, agencyId), eq(sends.clientId, clientId), eq(sends.status, "sent"), gte(sends.sentAt, since));
  const [totals] = await db
    .select({
      sent: count(),
      positive: sql<number>`count(*) filter (where ${sends.replyClass} = 'positive')`,
      replies: sql<number>`count(*) filter (where ${sends.replyClass} in ('positive', 'neutral', 'negative'))`,
      meetings: sql<number>`count(*) filter (where ${sends.meetingBooked})`,
    })
    .from(sends)
    .where(where);

  const topSignals = await db
    .select({ name: signalDefinitions.name, n: sql<number>`count(distinct ${sends.id})` })
    .from(sends)
    .innerJoin(leadSignals, eq(leadSignals.leadId, sends.leadId))
    .innerJoin(signals, eq(signals.id, leadSignals.signalId))
    .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
    .where(where)
    .groupBy(signalDefinitions.name)
    .orderBy(desc(sql`count(distinct ${sends.id})`))
    .limit(5);

  const bestPlays = await db
    .select({
      name: plays.name,
      sent: count(),
      positive: sql<number>`count(*) filter (where ${sends.replyClass} = 'positive')`,
    })
    .from(sends)
    .innerJoin(drafts, eq(drafts.id, sends.draftId))
    .innerJoin(plays, eq(plays.id, drafts.playId))
    .where(where)
    .groupBy(plays.name)
    .orderBy(desc(sql`count(*) filter (where ${sends.replyClass} = 'positive')`), desc(count()))
    .limit(5);

  const sent = Number(totals.sent);
  return {
    period: { from: since.toISOString(), to: now.toISOString() },
    sent,
    replies: Number(totals.replies),
    positive: Number(totals.positive),
    positivePer100: sent ? Math.round((Number(totals.positive) / sent) * 1000) / 10 : 0,
    meetings: Number(totals.meetings),
    topSignals: topSignals.map((s) => ({ name: s.name, count: Number(s.n) })),
    bestPlays: bestPlays.map((p) => ({ name: p.name, sent: Number(p.sent), positive: Number(p.positive) })),
  };
}

/**
 * On each client's first workday, emails their viewers + alert-email targets the weekly report,
 * branded as the agency (white-label).
 */
export async function sendWeeklyReports(timezone: string, now = new Date()) {
  const rows = (await db.select({ client: clients, agency: agencies }).from(clients).innerJoin(agencies, eq(agencies.id, clients.agencyId))).filter(
    ({ client }) => offsetMinutes(client.timezone, now) === offsetMinutes(timezone, now) && isFirstWorkdayOfWeek(now, client.timezone),
  );
  let sent = 0;
  for (const { client, agency } of rows) {
    const r = await weeklyReport(agency.id, client.id, now);
    if (!r.sent) continue;
    const viewers = await db.select({ email: users.email }).from(users).where(and(eq(users.clientId, client.id), eq(users.role, "client_viewer")));
    const rules = await db.select({ target: alertRules.target }).from(alertRules).where(and(eq(alertRules.clientId, client.id), eq(alertRules.channel, "email"), eq(alertRules.active, true)));
    const to = [...new Set([...viewers.map((v) => v.email), ...rules.map((x) => x.target)])];
    if (!to.length) continue;
    const lines = [
      `Emails sent: ${r.sent}`,
      `Positive replies per 100 sends: ${r.positivePer100}`,
      `Meetings: ${r.meetings}`,
      `Top signals: ${r.topSignals.map((s) => `${s.name} (${s.count})`).join(", ") || "—"}`,
      `Best plays: ${r.bestPlays.map((p) => `${p.name} (${p.positive}/${p.sent})`).join(", ") || "—"}`,
    ];
    const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f6f4ef;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e7e3da;border-radius:14px;padding:24px"><div style="font-weight:600">${escapeHtml(agency.name)}</div><h1 style="font-size:18px">${escapeHtml(client.name)} — weekly outbound report</h1><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul></div></body></html>`;
    await sendMail({ to, subject: `${client.name}: weekly outbound report`, text: lines.join("\n"), html });
    sent++;
  }
  return { sent };
}

const BUCKETS = [
  { label: "0–40", min: 0, max: 40 },
  { label: "40–60", min: 40, max: 60 },
  { label: "60–80", min: 60, max: 80 },
  { label: "80–100", min: 80, max: 101 },
];

/** Reply rate by simulated-score bucket, per vertical, plus the A/B comparison. */
export async function calibration(agencyId: string, clientId?: string) {
  const rows = await db
    .select({
      score: sends.scoreAtSend,
      replyClass: sends.replyClass,
      replied: sql<boolean>`${sends.replyClass} in ('positive', 'neutral', 'negative')`,
      abGroup: sends.abGroup,
      vertical: companies.vertical,
    })
    .from(sends)
    .innerJoin(leads, eq(leads.id, sends.leadId))
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(sends.agencyId, agencyId), eq(sends.status, "sent"), isNotNull(sends.scoreAtSend), clientId ? eq(sends.clientId, clientId) : undefined));

  const verticals = [...new Set(rows.map((r) => r.vertical ?? "Unknown"))];
  const table = ["All", ...verticals].map((v) => ({
    vertical: v,
    buckets: BUCKETS.map((b) => {
      const inB = rows.filter((r) => (v === "All" || (r.vertical ?? "Unknown") === v) && r.score! >= b.min && r.score! < b.max);
      const replies = inB.filter((r) => r.replied).length;
      const positive = inB.filter((r) => r.replyClass === "positive").length;
      return { bucket: b.label, sent: inB.length, replies, positive, replyRate: inB.length ? Math.round((replies / inB.length) * 1000) / 10 : null };
    }),
  }));
  const ab = ["control", "challenger"].map((g) => {
    const inG = rows.filter((r) => r.abGroup === g);
    const replies = inG.filter((r) => r.replied).length;
    return { group: g, label: g === "control" ? "Winner variant" : "Second-best variant (10%)", sent: inG.length, replies, replyRate: inG.length ? Math.round((replies / inG.length) * 1000) / 10 : null };
  });
  return { table, ab, total: rows.length };
}
