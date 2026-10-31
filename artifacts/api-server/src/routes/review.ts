import { Router } from "express";
import { and, eq, isNotNull, inArray, asc } from "drizzle-orm";
import { db, leads, companies, clients, drafts, sends, mailboxes, suppression, brainEntries, users } from "@workspace/db";
import { ApproveAndSendDraftBody, MarkSendReplyBody } from "@workspace/api-zod";
import { requireUser, requireAgencyStaff } from "../lib/security";
import { leadEvidence } from "../lib/signals/scoring";
import { sendEmail, demoRecipient } from "../lib/resend";
import { blockReasons, sentToday, audit, DAILY_CAP, domainOf } from "../lib/compliance";

const router = Router();
router.use("/review", requireUser, requireAgencyStaff);

const view = (d: typeof drafts.$inferSelect) => ({ id: d.id, variant: d.variant, subject: d.subject, body: d.body, language: d.language,
  score: d.score, simulation: (d.sim as any)?.simulation || null, model: (d.sim as any)?.model || "Not recorded" });

router.get("/review/queue", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const [rows, emails, sent, evidence, approvers] = await Promise.all([
    db.select({ lead: leads, company: companies }).from(leads).innerJoin(companies, eq(companies.id, leads.companyId))
      .where(and(eq(leads.agencyId, agencyId), isNotNull(leads.demoKey))),
    db.select().from(drafts).where(eq(drafts.agencyId, agencyId)).orderBy(asc(drafts.variant)),
    db.select().from(sends).where(eq(sends.agencyId, agencyId)),
    leadEvidence(agencyId),
    db.select({ id: users.id, email: users.email }).from(users).where(eq(users.agencyId, agencyId)),
  ]);
  const items = [];
  for (const { lead, company } of rows) {
    const own = emails.filter(d => d.leadId === lead.id);
    if (!own.length) continue;
    const send = sent.find(s => own.some(d => d.id === s.draftId)) ?? null;
    const winner = send ? own.find(d => d.id === send.draftId)!
      : [...own].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.variant - b.variant)[0]!;
    const e = evidence.find(x => x.id === lead.id);
    const score = e?.totalScore ?? lead.tempScore;
    const top = e ? [...e.signals].sort((a, b) => b.points - a.points)[0] : undefined;
    const reasons = send ? [] : await blockReasons(agencyId, { email: lead.email, domain: company.domain, body: winner.body });
    items.push({ leadId: lead.id, fullName: lead.fullName, title: lead.title || "", companyName: company.name, country: company.country || "",
      email: lead.email, sample: lead.sample, legalBasis: lead.legalBasis,
      temperature: (score >= 70 ? "hot" : score >= 35 ? "warm" : "cold") as "hot" | "warm" | "cold", totalScore: score,
      topSignal: top ? `${top.name}: ${top.title}` : null, winnerDraftId: winner.id, subject: winner.subject, score: winner.score,
      state: (send ? "sent" : reasons.length ? "blocked" : "ready") as "sent" | "blocked" | "ready", blockReason: reasons[0] ?? null,
      send: send ? { id: send.id, draftId: send.draftId, sentAt: send.sentAt.toISOString(), recipient: send.recipient,
        replyClass: send.replyClass, approvedBy: approvers.find(u => u.id === send.approvedBy)?.email ?? null } : null,
      drafts: own.map(view) });
  }
  items.sort((a, b) => b.totalScore - a.totalScore);
  res.json({ items, recipient: demoRecipient(), dailyCap: DAILY_CAP, sentToday: await sentToday(agencyId) });
});

async function demoMailbox(agencyId: string, clientId: string) {
  const [existing] = await db.select().from(mailboxes).where(and(eq(mailboxes.agencyId, agencyId), eq(mailboxes.clientId, clientId))).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(mailboxes).values({ agencyId, clientId, provider: "gmail", email: process.env.RESEND_FROM_EMAIL || "demo@tawqeet.invalid",
    dailyCap: DAILY_CAP, tokensEncrypted: "demo:no-tokens", status: "demo" }).returning();
  return created!;
}

router.post("/review/drafts/:id/send", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const input = ApproveAndSendDraftBody.safeParse(req.body);
  if (!input.success || !input.data.subject.trim() || !input.data.body.trim()) { res.status(400).json({ error: "Subject and body are required." }); return; }
  const [row] = await db.select({ draft: drafts, lead: leads, company: companies, client: clients }).from(drafts)
    .innerJoin(leads, eq(leads.id, drafts.leadId)).innerJoin(companies, eq(companies.id, leads.companyId))
    .innerJoin(clients, eq(clients.id, leads.clientId))
    .where(and(eq(drafts.agencyId, agencyId), eq(drafts.id, String(req.params.id)))).limit(1);
  if (!row) { res.status(404).json({ error: "Draft not found." }); return; }
  const siblings = await db.select({ id: drafts.id }).from(drafts).where(and(eq(drafts.agencyId, agencyId), eq(drafts.leadId, row.lead.id)));
  const [already] = await db.select().from(sends).where(and(eq(sends.agencyId, agencyId), inArray(sends.draftId, siblings.map(s => s.id)))).limit(1);
  if (already) { res.status(409).json({ error: "An email was already sent to this lead." }); return; }
  const recipient = demoRecipient();
  if (!recipient) { res.status(503).json({ error: "No demo recipient configured. Set ALERT_EMAIL_TO or OWNER_EMAIL." }); return; }
  const { subject, body } = input.data;
  const reasons = await blockReasons(agencyId, { email: row.lead.email, domain: row.company.domain, body });
  if (reasons.length) { res.status(422).json({ error: `Blocked: ${reasons.join("; ")}.` }); return; }
  const mailbox = await demoMailbox(agencyId, row.lead.clientId);
  if (await sentToday(agencyId) >= Math.min(mailbox.dailyCap, DAILY_CAP)) { res.status(429).json({ error: `Daily cap of ${DAILY_CAP} sends reached.` }); return; }
  await audit(agencyId, req.user!.id, "draft.approve", `${row.company.name} — ${row.lead.fullName}`, { draftId: row.draft.id });
  const intended = row.lead.email || "sample contact";
  const from = process.env.RESEND_FROM_EMAIL || "";
  const text = `Sent from client mailbox (demo) — ${row.client.name}. Intended recipient: ${intended}. Demo emails go only to the demo recipient.\n\n${body}`;
  let providerId: string | null;
  try {
    providerId = (await sendEmail({ to: recipient, subject: `[Demo · to ${intended}] ${subject}`, text,
      headers: { "List-Unsubscribe": `<mailto:${from}?subject=unsubscribe>` } })).id;
  } catch (e) {
    await audit(agencyId, req.user!.id, "send.failed", `${row.company.name} — ${row.lead.fullName}`, { error: e instanceof Error ? e.message : "failed" });
    res.status(502).json({ error: `Email was not sent: ${e instanceof Error ? e.message : "delivery failed"}` }); return;
  }
  const now = new Date();
  const [send] = await db.insert(sends).values({ agencyId, draftId: row.draft.id, mailboxId: mailbox.id, sentAt: now, providerMessageId: providerId,
    approvedBy: req.user!.id, approvedAt: now, recipient, subject, body }).returning();
  await db.update(drafts).set({ subject, body, status: "sent" }).where(eq(drafts.id, row.draft.id));
  await db.update(leads).set({ status: "sent" }).where(eq(leads.id, row.lead.id));
  await audit(agencyId, req.user!.id, "send", `${row.company.name} — ${row.lead.fullName} → ${recipient}`, { sendId: send!.id });
  res.json({ message: `Sent to the demo recipient ${recipient}.`, sendId: send!.id, recipient });
});

router.post("/review/sends/:id/reply", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const input = MarkSendReplyBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Choose positive, neutral, negative or unsubscribe." }); return; }
  const [row] = await db.select({ send: sends, draft: drafts, lead: leads, company: companies }).from(sends)
    .innerJoin(drafts, eq(drafts.id, sends.draftId)).innerJoin(leads, eq(leads.id, drafts.leadId))
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(sends.agencyId, agencyId), eq(sends.id, String(req.params.id)))).limit(1);
  if (!row) { res.status(404).json({ error: "Send not found." }); return; }
  const replyClass = input.data.replyClass;
  await db.update(sends).set({ replyClass, repliedAt: new Date() }).where(eq(sends.id, row.send.id));
  await db.update(leads).set({ status: replyClass === "unsubscribe" ? "closed" : "replied" }).where(eq(leads.id, row.lead.id));
  // The brain-learning trigger normally records the learning; write one here if it is not installed.
  const learned = await db.select({ id: brainEntries.id, meta: brainEntries.meta }).from(brainEntries)
    .where(and(eq(brainEntries.agencyId, agencyId), eq(brainEntries.clientId, row.lead.clientId), eq(brainEntries.kind, "learning")));
  if (!learned.some(l => (l.meta as any)?.send_id === row.send.id && (l.meta as any)?.reply_class === replyClass)) {
    const meta = { vertical: row.company.vertical || "", language: row.draft.language, subject: row.draft.subject, score: row.draft.score,
      persona: row.lead.title, reply_class: replyClass, send_id: row.send.id, source: "review" };
    await db.insert(brainEntries).values({ agencyId, clientId: row.lead.clientId, kind: "learning", content: JSON.stringify(meta), meta });
  }
  if (replyClass === "unsubscribe") {
    const target = row.lead.email ? { email: row.lead.email.toLowerCase() } : { domain: domainOf(row.company.domain || row.company.name) };
    await db.insert(suppression).values({ agencyId, ...target, reason: "Unsubscribed via reply" });
    await audit(agencyId, req.user!.id, "suppression.add", target.email || target.domain || "", { reason: "unsubscribe reply" });
  }
  await audit(agencyId, req.user!.id, "reply.mark", `${row.company.name} — ${row.lead.fullName}: ${replyClass}`);
  res.json({ message: replyClass === "unsubscribe" ? "Unsubscribe recorded and contact suppressed." : "Reply recorded as a Brain learning." });
});
export default router;
