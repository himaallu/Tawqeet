import { Router } from "express";
import { and, eq, desc, count, inArray, isNull, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, clients, drafts, simRuns, aiUsage, sends, alertsLog, leads, companies, suppression, auditLog, users, leadSignals, signals, signalDefinitions, agencies, shareLinks, sessions, plays } from "@workspace/db";
import { SendTestAlertBody, AddSuppressionBody, CheckRecipientBody, SendDigestNowBody, CreateReportShareLinkBody, ShareLoginBody, UpdateAbTestBody, CreatePlayBody } from "@workspace/api-zod";
import { requireUser, requireAgencyStaff, randomToken, hashToken, COOKIE_NAME } from "../lib/security";
import { appOrigin } from "../lib/config";
import { leadEvidence } from "../lib/signals/scoring";
import { sendDigest } from "../lib/digests";
import { PLAN, simulationsThisMonth } from "../lib/plan";
import { testAlert } from "../lib/alerts";
import { direct } from "../lib/integrations";
import { demoRecipient } from "../lib/resend";
import { blockReasons, audit, FREE_MAIL_DOMAINS, DAILY_CAP, domainOf } from "../lib/compliance";

const router = Router();
const PRICE = PLAN.priceUsd, INCLUDED = PLAN.includedClients, EXTRA = PLAN.extraClientUsd;

router.get("/public/landing", (_req, res) => {
  const owner = process.env.OWNER_EMAIL;
  res.json({ bookDemoUrl: process.env.BOOK_DEMO_URL || (owner ? `mailto:${owner}?subject=${encodeURIComponent("Tawqeet demo")}` : null), priceUsd: PRICE });
});

for (const p of ["/settings/alerts", "/settings/billing", "/settings/compliance", "/settings/ab", "/reports/share", "/contacts", "/plays"]) router.use(p, requireUser, requireAgencyStaff);
router.use("/reports", requireUser);

router.post("/share/login", async (req, res) => {
  const input = ShareLoginBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Invalid share link." }); return; }
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hashToken(input.data.token))).limit(1);
  if (!link || link.expiresAt < new Date()) { res.status(410).json({ error: "This share link has expired. Ask your agency for a new one." }); return; }
  const email = `viewer+${link.clientId}@tawqeet.invalid`;
  const [user] = await db.insert(users).values({ agencyId: link.agencyId, email, role: "client_viewer", clientId: link.clientId })
    .onConflictDoUpdate({ target: users.email, set: { role: "client_viewer", clientId: link.clientId, agencyId: link.agencyId } }).returning();
  const token = randomToken(), expiresAt = new Date(Math.min(link.expiresAt.getTime(), Date.now() + 24 * 3600_000));
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId: user!.id, agencyId: link.agencyId, expiresAt });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax", path: "/", expires: expiresAt });
  res.json({ message: "Read-only client report opened." });
});
router.post("/reports/share", async (req, res) => {
  const input = CreateReportShareLinkBody.safeParse(req.body);
  const [client] = input.success ? await db.select().from(clients).where(and(eq(clients.agencyId, req.user!.agencyId), eq(clients.id, input.data.clientId))) : [];
  if (!client) { res.status(404).json({ error: "Client not found." }); return; }
  const token = randomToken(), expiresAt = new Date(Date.now() + 7 * 86_400_000);
  await db.insert(shareLinks).values({ agencyId: req.user!.agencyId, clientId: client.id, tokenHash: hashToken(token), expiresAt });
  await audit(req.user!.agencyId, req.user!.id, "share.create", `Read-only report link for ${client.name}`);
  res.json({ url: `${appOrigin()}/share/${token}`, expiresAt: expiresAt.toISOString() });
});
router.patch("/settings/ab", async (req, res) => {
  const input = UpdateAbTestBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Invalid setting." }); return; }
  await db.update(agencies).set({ abTestEnabled: input.data.enabled }).where(eq(agencies.id, req.user!.agencyId));
  await audit(req.user!.agencyId, req.user!.id, "ab.toggle", input.data.enabled ? "on" : "off");
  res.json({ message: input.data.enabled ? "A/B test on: 10% of approvals send the second-best variant." : "A/B test off." });
});
router.post("/settings/alerts/digest", async (req, res) => {
  const input = SendDigestNowBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Choose warm or cold." }); return; }
  res.json({ message: (await sendDigest(req.user!.agencyId, input.data.kind)).message });
});

router.get("/contacts/:id/export", async (req, res) => {
  const agencyId = req.user!.agencyId, id = String(req.params.id);
  const [row] = await db.select({ lead: leads, company: companies }).from(leads).innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(leads.agencyId, agencyId), eq(leads.id, id)));
  if (!row) { res.status(404).json({ error: "Contact not found." }); return; }
  const own = await db.select().from(drafts).where(and(eq(drafts.agencyId, agencyId), eq(drafts.leadId, id)));
  const sent = own.length ? await db.select().from(sends).where(and(eq(sends.agencyId, agencyId), inArray(sends.draftId, own.map(d => d.id)))) : [];
  const evidence = (await leadEvidence(agencyId)).find(e => e.id === id);
  await audit(agencyId, req.user!.id, "contact.export", `${row.company.name} — ${row.lead.fullName}`);
  const { demoKey: _k, ...contact } = row.lead;
  res.json({ exportedAt: new Date().toISOString(), contact: { ...contact, createdAt: row.lead.createdAt.toISOString() },
    company: { name: row.company.name, domain: row.company.domain, country: row.company.country, vertical: row.company.vertical },
    legalBasis: row.lead.legalBasis, signals: evidence?.signals ?? [],
    drafts: own.map(d => ({ id: d.id, variant: d.variant, subject: d.subject, body: d.body, language: d.language, score: d.score, status: d.status })),
    sends: sent.map(s => ({ id: s.id, sentAt: s.sentAt.toISOString(), recipient: s.recipient, subject: s.subject, replyClass: s.replyClass, deliveryEvent: s.deliveryEvent })) });
});
router.delete("/contacts/:id", async (req, res) => {
  const agencyId = req.user!.agencyId, id = String(req.params.id);
  const [row] = await db.select({ lead: leads, company: companies }).from(leads).innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(leads.agencyId, agencyId), eq(leads.id, id)));
  if (!row) { res.status(404).json({ error: "Contact not found." }); return; }
  const ref = createHash("sha256").update(`${row.lead.id}:${row.lead.email ?? row.lead.fullName}`).digest("hex").slice(0, 12);
  await db.transaction(async tx => {
    if (row.lead.email) await tx.insert(suppression).values({ agencyId, email: row.lead.email.toLowerCase(), reason: "Contact deleted (data rights request)" });
    await tx.update(alertsLog).set({ leadId: null }).where(and(eq(alertsLog.agencyId, agencyId), eq(alertsLog.leadId, id)));
    // Anonymise earlier audit rows that named this contact.
    await tx.update(auditLog).set({ target: sql`replace(${auditLog.target}, ${row.lead.fullName}, ${`contact #${ref}`})` })
      .where(and(eq(auditLog.agencyId, agencyId), sql`position(${row.lead.fullName} in ${auditLog.target}) > 0`));
    await tx.delete(leads).where(and(eq(leads.agencyId, agencyId), eq(leads.id, id)));
    await tx.insert(auditLog).values({ agencyId, userId: req.user!.id, action: "contact.delete", target: `contact #${ref} at ${row.company.name}`,
      meta: { ref, suppressed: Boolean(row.lead.email) } });
  });
  res.json({ message: row.lead.email ? "Contact deleted and email added to suppression." : "Contact deleted. It had no email address, so nothing was added to suppression." });
});

router.get("/plays", async (req, res) => {
  const [list, defs] = await Promise.all([
    db.select().from(plays).where(eq(plays.agencyId, req.user!.agencyId)),
    db.select().from(signalDefinitions).where(eq(signalDefinitions.active, true)),
  ]);
  res.json({ plays: list.map(p => ({ ...p, language: p.language === "ar" ? "ar" : "en" })),
    signals: defs.map(d => ({ key: d.key, name: d.name, playHint: d.playHint })).sort((a, b) => a.name.localeCompare(b.name)) });
});
const playInput = (body: unknown) => {
  const p = CreatePlayBody.safeParse(body);
  if (!p.success || !p.data.name.trim() || !p.data.structure.trim()) return null;
  return { signalKey: p.data.signalKey, language: p.data.language, name: p.data.name.trim(), structure: p.data.structure.trim(),
    principles: p.data.principles.trim(), persona: p.data.persona?.trim() || null };
};
router.post("/plays", async (req, res) => {
  const input = playInput(req.body);
  if (!input) { res.status(400).json({ error: "Signal, name and structure are required." }); return; }
  try {
    const [play] = await db.insert(plays).values({ ...input, agencyId: req.user!.agencyId }).returning();
    await audit(req.user!.agencyId, req.user!.id, "play.create", input.name);
    res.json({ ...play!, language: input.language });
  } catch { res.status(400).json({ error: "Unknown signal." }); }
});
router.patch("/plays/:id", async (req, res) => {
  const input = playInput(req.body);
  if (!input) { res.status(400).json({ error: "Signal, name and structure are required." }); return; }
  try {
    const [play] = await db.update(plays).set(input).where(and(eq(plays.agencyId, req.user!.agencyId), eq(plays.id, String(req.params.id)))).returning();
    if (!play) { res.status(404).json({ error: "Play not found." }); return; }
    res.json({ ...play, language: input.language });
  } catch { res.status(400).json({ error: "Unknown signal." }); }
});

router.get("/settings/alerts", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const webhook = Boolean(process.env.ALERT_WEBHOOK_URL), email = Boolean(demoRecipient() && process.env.RESEND_FROM_EMAIL);
  const via = (name: string) => webhook ? `Connected via Make webhook (${name})` : "Set ALERT_WEBHOOK_URL to route through Make";
  const ch = (key: "sms" | "trello" | "asana" | "clickup", name: string, vars: string, makeName: string) => direct[key]()
    ? { key, name, live: true, status: "Live (direct API)", detail: `Direct ${name} API (${vars})` }
    : { key, name, live: webhook, status: webhook ? "via Make webhook" : "Not configured", detail: `${via(makeName)}. Direct: set ${vars}.` };
  const channels = [
    { key: "email", name: "Email", live: email, status: email ? "Live" : "Not configured", detail: email ? `Resend → ${demoRecipient()}` : "Set ALERT_EMAIL_TO (or OWNER_EMAIL) and RESEND_FROM_EMAIL" },
    ch("sms", "SMS", "TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, ALERT_SMS_TO", "Make → SMS"),
    ch("trello", "Trello", "TRELLO_KEY, TRELLO_TOKEN, TRELLO_LIST_ID", "Make → Trello card"),
    ch("asana", "Asana", "ASANA_TOKEN, ASANA_PROJECT_ID", "Asana task"),
    ch("clickup", "ClickUp", "CLICKUP_TOKEN, CLICKUP_LIST_ID", "ClickUp task"),
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
  const simsMonth = await simulationsThisMonth(agencyId);
  res.json({ plan: "Agency", priceUsd: PRICE, includedClients: INCLUDED, extraClientUsd: EXTRA, clients: clientCount, extraClients: extra,
    monthlyTotalUsd: PRICE + extra * EXTRA, draftsGenerated: draftCount, simulationsRun: sims, aiCalls: calls,
    aiCostUsd: cost[0]?.c != null ? Math.round(Number(cost[0].c) * 100) / 100 : null, emailsSent: emailCount,
    paymentLink: process.env.STRIPE_PAYMENT_LINK || null, simulationAllowance: PLAN.simulationAllowance, simulationsThisMonth: simsMonth,
    atClientLimit: clientCount >= INCLUDED, atSimulationLimit: simsMonth >= PLAN.simulationAllowance });
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
  const viewer = req.user!.role === "client_viewer";
  if (viewer && !req.user!.clientId) { res.status(403).json({ error: "This account is not linked to a client." }); return; }
  const scope = viewer ? req.user!.clientId! : (typeof req.query.clientId === "string" && req.query.clientId ? req.query.clientId : null);
  const allClients = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.agencyId, agencyId));
  const [agency] = await db.select({ ab: agencies.abTestEnabled }).from(agencies).where(eq(agencies.id, agencyId));
  const rows = await db.select({ send: sends, draft: drafts, lead: leads, company: companies }).from(sends).innerJoin(drafts, eq(drafts.id, sends.draftId))
    .innerJoin(leads, eq(leads.id, drafts.leadId)).innerJoin(companies, eq(companies.id, leads.companyId))
    .where(scope ? and(eq(sends.agencyId, agencyId), eq(leads.clientId, scope)) : eq(sends.agencyId, agencyId));
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
    topSignals: tally(signalNames), bestSubjects: tally(positive.map(p => p.send.subject || p.draft.subject)), calibration,
    clientName: scope ? allClients.find(c => c.id === scope)?.name ?? null : null, readOnly: viewer,
    clients: viewer ? allClients.filter(c => c.id === scope) : allClients,
    sentEmails: [...rows].sort((a, b) => b.send.sentAt.getTime() - a.send.sentAt.getTime()).map(r => ({ id: r.send.id, sentAt: r.send.sentAt.toISOString(),
      leadName: r.lead.fullName, companyName: r.company.name, subject: r.send.subject || r.draft.subject, body: r.send.body || r.draft.body,
      replyClass: r.send.replyClass, abArm: r.send.abArm })),
    abEnabled: Boolean(agency?.ab),
    abArms: ["control", "challenger"].map(arm => {
      const inA = rows.filter(r => r.send.abArm === arm);
      const rep = inA.filter(r => r.send.replyClass && r.send.replyClass !== "ooo");
      return { bucket: arm === "control" ? "Control (best variant)" : "Challenger (second-best)", sends: inA.length, replies: rep.length,
        positive: inA.filter(r => r.send.replyClass === "positive").length, replyRate: inA.length ? Math.round(rep.length / inA.length * 1000) / 10 : 0 };
    }) });
});
export default router;
