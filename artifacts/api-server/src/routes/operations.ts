import { Router } from "express";
import { and, eq, desc, count, inArray, isNull, or, sql } from "drizzle-orm";
import { db, clients, drafts, simRuns, aiUsage, sends, alertsLog, leads, companies, suppression, auditLog, users, leadSignals, signals, signalDefinitions } from "@workspace/db";
import { SendTestAlertBody, AddSuppressionBody, CheckRecipientBody } from "@workspace/api-zod";
import { requireUser, requireAgencyStaff } from "../lib/security";
import { testAlert } from "../lib/alerts";
import { demoRecipient } from "../lib/resend";
import { blockReasons, audit, FREE_MAIL_DOMAINS, DAILY_CAP, domainOf } from "../lib/compliance";

const router = Router();
const PRICE = 399, INCLUDED = 5, EXTRA = 59;

router.get("/public/landing", (_req, res) => {
  const owner = process.env.OWNER_EMAIL;
  res.json({ bookDemoUrl: process.env.BOOK_DEMO_URL || (owner ? `mailto:${owner}?subject=${encodeURIComponent("Tawqeet demo")}` : null), priceUsd: PRICE });
});

for (const p of ["/settings/alerts", "/settings/billing", "/settings/compliance", "/reports"]) router.use(p, requireUser, requireAgencyStaff);

router.get("/settings/alerts", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const webhook = Boolean(process.env.ALERT_WEBHOOK_URL), email = Boolean(demoRecipient() && process.env.RESEND_FROM_EMAIL);
  const via = (name: string) => webhook ? `Connected via Make webhook (${name})` : "Set ALERT_WEBHOOK_URL to route through Make";
  const channels = [
    { key: "email", name: "Email", live: email, status: email ? "Live" : "Not configured", detail: email ? `Resend → ${demoRecipient()}` : "Set ALERT_EMAIL_TO (or OWNER_EMAIL) and RESEND_FROM_EMAIL" },
    { key: "sms", name: "SMS", live: webhook, status: "via Make webhook", detail: via("Make → SMS") },
    { key: "trello", name: "Trello", live: webhook, status: "via Make webhook", detail: via("Make → Trello card") },
    { key: "asana", name: "Asana", live: webhook, status: "via webhook", detail: via("Asana task") },
    { key: "clickup", name: "ClickUp", live: webhook, status: "via webhook", detail: via("ClickUp task") },
    { key: "webhook", name: "Webhook", live: webhook, status: webhook ? "Live" : "Not configured", detail: webhook ? "POST JSON to ALERT_WEBHOOK_URL" : "Set ALERT_WEBHOOK_URL" },
  ];
  const log = await db.select({ a: alertsLog, leadName: leads.fullName, companyName: companies.name }).from(alertsLog)
    .leftJoin(leads, eq(leads.id, alertsLog.leadId)).leftJoin(companies, eq(companies.id, leads.companyId))
    .where(eq(alertsLog.agencyId, agencyId)).orderBy(desc(alertsLog.createdAt)).limit(50);
  res.json({ channels, log: log.map(({ a, leadName, companyName }) => ({ id: a.id, leadName: leadName ?? (a.test ? "Sample Contact" : null),
    companyName: companyName ?? (a.test ? "Sample Co" : null), channel: a.channel, status: a.status, error: a.error, score: a.score,
    test: a.test, createdAt: a.createdAt.toISOString() })) });
});
router.post("/settings/alerts/test", async (req, res) => {
  const input = SendTestAlertBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Unknown channel." }); return; }
  const r = await testAlert(req.user!.agencyId, input.data.channel);
  res.json({ message: r.status === "sent" ? "Test alert sent." : r.status === "skipped" ? `Not sent: ${r.error}` : `Test alert failed: ${r.error}` });
});

router.get("/settings/billing", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const [clientCount, draftCount, sims, calls, emailCount, cost] = await Promise.all([
    n(db.select({ n: count() }).from(clients).where(eq(clients.agencyId, agencyId))),
    n(db.select({ n: count() }).from(drafts).where(eq(drafts.agencyId, agencyId))),
    n(db.select({ n: count() }).from(simRuns).where(and(eq(simRuns.agencyId, agencyId), eq(simRuns.check, "spam")))),
    n(db.select({ n: count() }).from(aiUsage).where(eq(aiUsage.agencyId, agencyId))),
    n(db.select({ n: count() }).from(sends).where(eq(sends.agencyId, agencyId))),
    db.select({ c: sql<string | null>`sum(${aiUsage.costUsd})` }).from(aiUsage).where(eq(aiUsage.agencyId, agencyId)),
  ]);
  const extra = Math.max(0, clientCount - INCLUDED);
  res.json({ plan: "Agency", priceUsd: PRICE, includedClients: INCLUDED, extraClientUsd: EXTRA, clients: clientCount, extraClients: extra,
    monthlyTotalUsd: PRICE + extra * EXTRA, draftsGenerated: draftCount, simulationsRun: sims, aiCalls: calls,
    aiCostUsd: cost[0]?.c != null ? Math.round(Number(cost[0].c) * 100) / 100 : null, emailsSent: emailCount,
    paymentLink: process.env.STRIPE_PAYMENT_LINK || null });
});

router.get("/settings/compliance", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const [list, log] = await Promise.all([
    db.select().from(suppression).where(or(eq(suppression.agencyId, agencyId), isNull(suppression.agencyId))).orderBy(desc(suppression.createdAt)),
    db.select({ a: auditLog, email: users.email }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
      .where(eq(auditLog.agencyId, agencyId)).orderBy(desc(auditLog.createdAt)).limit(100),
  ]);
  res.json({
    rules: [
      { key: "free_mail", label: "Block free-mail domains", description: "Gmail, Yahoo, Hotmail, Outlook.com, iCloud, AOL and Proton addresses are never contacted.", enabled: true },
      { key: "opt_out", label: "Opt-out line required", description: "Every email must carry an opt-out line and a List-Unsubscribe header.", enabled: true },
      { key: "daily_cap", label: `Daily cap (${DAILY_CAP} per mailbox)`, description: "Sending stops after the cap until the next UTC day.", enabled: true },
      { key: "human_approval", label: "Human approval required", description: "Nothing is sent until a team member clicks Approve & Send; the approver is recorded.", enabled: true },
      { key: "legal_basis", label: "B2B legitimate-interest basis", description: "Each lead carries a recorded legal basis (default: B2B legitimate interest).", enabled: true },
      { key: "demo_recipient", label: "Demo recipient only", description: "In this demo, email is delivered only to ALERT_EMAIL_TO / OWNER_EMAIL, never to the lead.", enabled: true },
    ],
    freeMailDomains: FREE_MAIL_DOMAINS, dailyCap: DAILY_CAP,
    suppression: list.map(s => ({ id: s.id, email: s.email, domain: s.domain, reason: s.reason, createdAt: s.createdAt.toISOString() })),
    audit: log.map(({ a, email }) => ({ id: a.id, action: a.action, target: a.target, actor: email ?? (a.userId ? null : "system"), createdAt: a.createdAt.toISOString() })),
  });
});
router.post("/settings/compliance/suppression", async (req, res) => {
  const input = AddSuppressionBody.safeParse(req.body);
  const value = input.success ? input.data.value.trim().toLowerCase() : "";
  if (!value || !/^[^\s@]+(@[^\s@]+)?\.[^\s@]+$|^[^\s@]+@[^\s@]+$/.test(value)) { res.status(400).json({ error: "Enter an email address or a domain." }); return; }
  const target = value.includes("@") ? { email: value } : { domain: domainOf(value) };
  await db.insert(suppression).values({ agencyId: req.user!.agencyId, ...target, reason: input.data?.reason?.trim() || "Added manually" });
  await audit(req.user!.agencyId, req.user!.id, "suppression.add", value);
  res.json({ message: `${value} suppressed.` });
});
router.delete("/settings/compliance/suppression/:id", async (req, res) => {
  const [row] = await db.delete(suppression).where(and(eq(suppression.agencyId, req.user!.agencyId), eq(suppression.id, String(req.params.id)))).returning();
  if (!row) { res.status(404).json({ error: "Entry not found." }); return; }
  await audit(req.user!.agencyId, req.user!.id, "suppression.remove", row.email || row.domain || "");
  res.json({ message: "Removed from suppression list." });
});
router.post("/settings/compliance/check", async (req, res) => {
  const input = CheckRecipientBody.safeParse(req.body);
  if (!input.success || !input.data.email.trim()) { res.status(400).json({ error: "Enter an email address." }); return; }
  const reasons = await blockReasons(req.user!.agencyId, { email: input.data.email.trim().toLowerCase(), domain: null });
  res.json({ allowed: reasons.length === 0, reasons });
});

router.get("/reports", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const rows = await db.select({ send: sends, draft: drafts, lead: leads }).from(sends).innerJoin(drafts, eq(drafts.id, sends.draftId))
    .innerJoin(leads, eq(leads.id, drafts.leadId)).where(eq(sends.agencyId, agencyId));
  const replied = rows.filter(r => r.send.replyClass && r.send.replyClass !== "ooo");
  const positive = rows.filter(r => r.send.replyClass === "positive");
  const leadIds = rows.map(r => r.lead.id);
  const sig = leadIds.length ? await db.select({ leadId: leadSignals.leadId, name: signalDefinitions.name }).from(leadSignals)
    .innerJoin(signals, eq(signals.id, leadSignals.signalId)).innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
    .where(and(eq(leadSignals.agencyId, agencyId), inArray(leadSignals.leadId, leadIds))) : [];
  const fallback = leadIds.length ? await db.select({ companyId: signals.companyId, name: signalDefinitions.name }).from(signals)
    .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
    .where(and(eq(signals.agencyId, agencyId), inArray(signals.companyId, rows.map(r => r.lead.companyId)))) : [];
  const tally = (names: string[]) => Object.entries(names.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {}))
    .map(([name, c]) => ({ name, count: c })).sort((a, b) => b.count - a.count).slice(0, 5);
  const signalNames = rows.flatMap(r => {
    const own = sig.filter(s => s.leadId === r.lead.id).map(s => s.name);
    return [...new Set(own.length ? own : fallback.filter(f => f.companyId === r.lead.companyId).map(f => f.name))];
  });
  const buckets = [[0, 49, "0–49"], [50, 69, "50–69"], [70, 84, "70–84"], [85, 100, "85–100"]] as const;
  const calibration = buckets.map(([lo, hi, label]) => {
    const inB = rows.filter(r => r.lead.tempScore >= lo && r.lead.tempScore <= hi);
    const rep = inB.filter(r => r.send.replyClass && r.send.replyClass !== "ooo");
    return { bucket: label, sends: inB.length, replies: rep.length, positive: inB.filter(r => r.send.replyClass === "positive").length,
      replyRate: inB.length ? Math.round(rep.length / inB.length * 1000) / 10 : 0 };
  });
  res.json({ emailsSent: rows.length, replies: replied.length, positiveReplies: positive.length,
    positivePer100: rows.length ? Math.round(positive.length / rows.length * 1000) / 10 : 0,
    topSignals: tally(signalNames), bestSubjects: tally(positive.map(p => p.send.subject || p.draft.subject)), calibration });
});
export default router;
