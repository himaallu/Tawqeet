import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { REPLY_CLASSES, type ReplyClass } from "../../shared/enums";
import { db } from "../db";
import { clients, companies, drafts, leads, leadSignals, mailboxes, plays, sends, signals } from "../db/schema";
import { aiObject } from "../lib/ai";
import { audit } from "../lib/audit";
import { contactBlockReason, suppress } from "../lib/compliance";
import { nextLocalTime, startOfLocalDay } from "../lib/gulf-time";
import { enqueue, Q } from "../lib/jobs";
import { sendMail } from "../lib/mail";
import { hasOptOut } from "../lib/spam";
import { recordLearning } from "./brain";
import { personaOf } from "./writer";
import { MailboxAuthError, transmit } from "./mailboxes";
import { recomputeAccount } from "./scoring";

/**
 * Review & Send. Nothing is sent without a human: approveAndSend() is the only way a send row
 * is created, and it requires the approving user. Sends are queued with a random 2–6 minute
 * gap per mailbox and capped at mailboxes.daily_cap.
 */
export class SendError extends Error {
  status = 400;
}

const appUrl = () => (process.env.APP_URL ?? "http://localhost:5000").replace(/\/$/, "");
const inboundDomain = () => process.env.INBOUND_DOMAIN?.trim() || null;
const randomGapMs = () => (2 + Math.random() * 4) * 60_000;

/** When the next send from this mailbox may go: ≥ 2–6 min after the last, inside the daily cap. */
export async function nextSlot(mb: typeof mailboxes.$inferSelect, timezone: string, now = new Date()): Promise<Date> {
  const [last] = await db
    .select({ at: sends.scheduledFor })
    .from(sends)
    .where(and(eq(sends.mailboxId, mb.id), inArray(sends.status, ["scheduled", "sent"])))
    .orderBy(desc(sends.scheduledFor))
    .limit(1);
  let at = new Date(Math.max(now.getTime(), (last?.at.getTime() ?? 0) + randomGapMs()));
  for (let guard = 0; guard < 14; guard++) {
    const dayStart = startOfLocalDay(at, timezone);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const [{ n }] = await db
      .select({ n: count() })
      .from(sends)
      .where(and(eq(sends.mailboxId, mb.id), inArray(sends.status, ["scheduled", "sent"]), gte(sends.scheduledFor, dayStart), sql`${sends.scheduledFor} < ${dayEnd}`));
    if (n < mb.dailyCap) return at;
    at = new Date(nextLocalTime(dayEnd, timezone, 9, 0).getTime() + Math.random() * 30 * 60_000); // next day, from 09:00
  }
  throw new SendError("Mailbox is fully booked for the next two weeks");
}

export async function approveAndSend(
  agencyId: string,
  userId: string,
  draftId: string,
  edit?: { subject: string; body: string },
) {
  const [row] = await db
    .select({ draft: drafts, lead: leads })
    .from(drafts)
    .innerJoin(leads, eq(leads.id, drafts.leadId))
    .where(and(eq(drafts.agencyId, agencyId), eq(drafts.id, draftId)));
  if (!row) throw new SendError("Draft not found");
  const { draft, lead } = row;
  if (["approved", "sent"].includes(draft.status)) throw new SendError("This email was already approved");
  const [alreadySent] = await db.select({ id: sends.id }).from(sends).where(and(eq(sends.leadId, lead.id), ne(sends.status, "cancelled"))).limit(1);
  if (alreadySent) throw new SendError("This lead already has an email queued or sent");

  const block = await contactBlockReason(agencyId, lead.email);
  if (block) throw new SendError(`Can't send: ${block}`);
  const subject = (edit?.subject ?? draft.subject).trim();
  const body = (edit?.body ?? draft.body).trim();
  if (!hasOptOut(body)) throw new SendError("Keep the opt-out line in the email");

  const [client] = await db.select().from(clients).where(eq(clients.id, lead.clientId));
  const [mb] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.agencyId, agencyId), eq(mailboxes.clientId, lead.clientId), eq(mailboxes.status, "connected")))
    .limit(1);
  if (!mb) throw new SendError("Connect a mailbox for this client first (Settings › Mailboxes)");

  const scheduledFor = await nextSlot(mb, client.timezone);
  const [ranked] = await db.execute<{ rank: number }>(
    sql`select rank from (select id, rank() over (order by score desc nulls last) as rank from drafts where lead_id = ${lead.id}) r where id = ${draft.id}`,
  ).then((r) => r.rows);
  const expectedRank = lead.abGroup === "challenger" ? 2 : 1;
  const abGroup = Number(ranked?.rank) === expectedRank ? lead.abGroup : "manual";

  const [send] = await db
    .insert(sends)
    .values({
      agencyId,
      clientId: lead.clientId,
      draftId: draft.id,
      leadId: lead.id,
      mailboxId: mb.id,
      approvedBy: userId,
      toEmail: lead.email!,
      subject,
      body,
      scheduledFor,
      replyToken: randomBytes(12).toString("hex"), // lowercase: mail systems may lowercase the alias
      scoreAtSend: draft.score,
      abGroup,
    })
    .returning();
  await db
    .update(drafts)
    .set({ status: "approved", ...(edit && (edit.subject !== draft.subject || edit.body !== draft.body) ? { subject, body } : {}) })
    .where(eq(drafts.id, draft.id));
  await audit({ agencyId, userId, action: "send.approved", entity: "send", entityId: send.id, meta: { draftId, leadId: lead.id, to: lead.email, scheduledFor, edited: !!edit } });
  await enqueue(Q.sendEmail, { agencyId, sendId: send.id }, { startAfter: scheduledFor });
  return send;
}

export async function cancelSend(agencyId: string, userId: string, sendId: string) {
  const [s] = await db
    .update(sends)
    .set({ status: "cancelled" })
    .where(and(eq(sends.agencyId, agencyId), eq(sends.id, sendId), eq(sends.status, "scheduled")))
    .returning();
  if (!s) throw new SendError("Only scheduled sends can be cancelled");
  await db.update(drafts).set({ status: "winner" }).where(eq(drafts.id, s.draftId));
  await audit({ agencyId, userId, action: "send.cancelled", entity: "send", entityId: s.id });
  return s;
}

export async function performSend(agencyId: string, sendId: string) {
  const [s] = await db.select().from(sends).where(and(eq(sends.agencyId, agencyId), eq(sends.id, sendId)));
  if (!s || s.status !== "scheduled") return { status: s?.status ?? "missing" };
  if (s.scheduledFor.getTime() > Date.now() + 5_000) {
    await enqueue(Q.sendEmail, { agencyId, sendId }, { startAfter: s.scheduledFor });
    return { status: "rescheduled" };
  }
  const block = await contactBlockReason(agencyId, s.toEmail);
  if (block) {
    await db.update(sends).set({ status: "cancelled", error: block }).where(eq(sends.id, s.id));
    return { status: "cancelled" };
  }
  const [mb] = await db.select().from(mailboxes).where(eq(mailboxes.id, s.mailboxId));
  if (!mb || mb.status !== "connected") {
    await db.update(sends).set({ status: "failed", error: `Mailbox ${mb?.status ?? "missing"}${mb?.pausedReason ? `: ${mb.pausedReason}` : ""}` }).where(eq(sends.id, s.id));
    return { status: "failed" };
  }

  const domain = inboundDomain();
  const unsubscribeUrl = `${appUrl()}/api/public/unsubscribe/${s.replyToken}`;
  const headers: Record<string, string> = {
    "List-Unsubscribe": domain ? `<mailto:unsubscribe+${s.replyToken}@${domain}>, <${unsubscribeUrl}>` : `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  try {
    const id = await transmit(mb, { to: s.toEmail, subject: s.subject, body: s.body, replyTo: domain ? `r+${s.replyToken}@${domain}` : undefined, headers });
    await db.update(sends).set({ status: "sent", sentAt: new Date(), providerMessageId: id }).where(eq(sends.id, s.id));
    await db.update(drafts).set({ status: "sent" }).where(eq(drafts.id, s.draftId));
    await db.update(leads).set({ status: "sent" }).where(eq(leads.id, s.leadId));
    return { status: "sent" };
  } catch (e) {
    if (e instanceof MailboxAuthError) await db.update(mailboxes).set({ status: "expired", pausedReason: e.message }).where(eq(mailboxes.id, mb.id));
    await db.update(sends).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(sends.id, s.id));
    return { status: "failed" };
  }
}

// ---------- replies + unsubscribes ----------

export function offlineReplyClass(text: string): ReplyClass {
  const t = text.toLowerCase();
  if (/^\s*(stop|unsubscribe|remove me)\b|توقف|إلغاء الاشتراك/.test(t)) return "unsubscribe";
  if (/out of (the )?office|on leave|annual leave|auto.?reply|خارج المكتب|إجازة/.test(t)) return "ooo";
  if (/not interested|no thanks|not relevant|don'?t contact|غير مهتم/.test(t)) return "negative";
  if (/interested|sounds good|let'?s (talk|chat)|book|schedule|tuesday|wednesday|call me|yes|مهتم|نعم|موعد/.test(t)) return "positive";
  return "neutral";
}

export async function classifyReply(agencyId: string, clientId: string, text: string): Promise<ReplyClass> {
  const r = await aiObject({
    agencyId,
    clientId,
    purpose: "reply.classify",
    tier: "fast",
    schema: z.object({ reply_class: z.enum(REPLY_CLASSES) }),
    system: "Classify this reply to a cold B2B email: positive (interest/meeting), neutral (question, referral, later), negative (no), ooo (out-of-office/auto-reply), unsubscribe (asks to stop).",
    prompt: text.slice(0, 4000),
    offline: () => ({ reply_class: offlineReplyClass(text) }),
  });
  return r.reply_class;
}

export type InboundEmail = { to: string[]; from: string; subject: string; text: string };

/** Normalises Postmark, Resend and plain JSON inbound payloads. */
export function parseInbound(body: Record<string, unknown>): InboundEmail | null {
  const data = (body.type === "email.received" && body.data ? body.data : body) as Record<string, unknown>;
  const list = (v: unknown): string[] =>
    (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
      .map((x) => (typeof x === "string" ? x : ((x as { Email?: string; email?: string }).Email ?? (x as { email?: string }).email ?? "")))
      .map((x) => x.match(/<([^>]+)>/)?.[1] ?? x)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  const to = [...list(data.ToFull ?? data.To ?? data.to), ...list(data.OriginalRecipient)];
  const from = list(data.FromFull ?? data.From ?? data.from)[0] ?? "";
  const text = String(data.StrippedTextReply || data.TextBody || data.text || data.plain || "");
  if (!to.length) return null;
  return { to, from, subject: String(data.Subject ?? data.subject ?? ""), text };
}

const tokenFrom = (to: string[], prefix: "r" | "unsubscribe") => {
  for (const addr of to) {
    const m = addr.match(new RegExp(`^${prefix}\\+([a-f0-9]+)@`, "i"));
    if (m) return m[1];
  }
  return null;
};

async function sendByToken(token: string) {
  const [s] = await db.select().from(sends).where(eq(sends.replyToken, token));
  return s ?? null;
}

export async function unsubscribeByToken(token: string, via: string) {
  const s = await sendByToken(token);
  if (!s) return false;
  await suppress(s.agencyId, s.toEmail, `Unsubscribed (${via})`);
  await db.update(sends).set({ replyClass: s.replyClass ?? "unsubscribe" }).where(eq(sends.id, s.id));
  await db.update(leads).set({ status: "closed" }).where(eq(leads.id, s.leadId));
  await audit({ agencyId: s.agencyId, action: "contact.unsubscribed", entity: "lead", entityId: s.leadId, meta: { via } });
  return true;
}

export async function handleInbound(mail: InboundEmail) {
  const unsub = tokenFrom(mail.to, "unsubscribe");
  if (unsub) return { handled: await unsubscribeByToken(unsub, "List-Unsubscribe mailto"), kind: "unsubscribe" };
  const token = tokenFrom(mail.to, "r");
  if (!token) return { handled: false, kind: "unknown" };
  const s = await sendByToken(token);
  if (!s) return { handled: false, kind: "unknown" };

  // Bounces (mailer-daemon DSNs) count against mailbox health, not as replies.
  if (/mailer-daemon|postmaster/.test(mail.from) || /undeliverable|delivery status notification|failure notice/i.test(mail.subject)) {
    await db.update(sends).set({ status: "bounced" }).where(eq(sends.id, s.id));
    return { handled: true, kind: "bounce" };
  }

  const replyClass = await classifyReply(s.agencyId, s.clientId, mail.text);
  await db.update(sends).set({ repliedAt: new Date(), replyClass, replyText: mail.text.slice(0, 10_000) }).where(eq(sends.id, s.id));
  await db.update(leads).set({ status: replyClass === "unsubscribe" ? "closed" : "replied" }).where(eq(leads.id, s.leadId));
  if (replyClass === "unsubscribe") await suppress(s.agencyId, s.toEmail, "Replied stop");

  await learnFromSend(s.agencyId, s.id, replyClass);
  const [lead] = await db.select().from(leads).where(eq(leads.id, s.leadId));
  if (lead?.accountId) await recomputeAccount(s.agencyId, lead.accountId);

  // Forward the reply to the client's real mailbox so they can answer it there.
  const [mb] = await db.select().from(mailboxes).where(eq(mailboxes.id, s.mailboxId));
  if (mb && mb.provider !== "demo") {
    await sendMail({
      to: mb.email,
      replyTo: mail.from,
      subject: `Re: ${s.subject}`,
      text: `${mail.from} replied (${replyClass}):\n\n${mail.text}\n\n— forwarded by Tawqeet; reply to answer them directly.`,
    });
  }
  return { handled: true, kind: replyClass };
}

/** Learning from day one: every reply class becomes a brain learning. */
export async function learnFromSend(agencyId: string, sendId: string, replyClass: ReplyClass) {
  const [row] = await db
    .select({ send: sends, draft: drafts, lead: leads, company: companies, play: plays })
    .from(sends)
    .innerJoin(drafts, eq(drafts.id, sends.draftId))
    .innerJoin(leads, eq(leads.id, sends.leadId))
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .leftJoin(plays, eq(plays.id, drafts.playId))
    .where(and(eq(sends.agencyId, agencyId), eq(sends.id, sendId)));
  if (!row) return;
  const [sig] = await db
    .select({ key: signals.definitionKey })
    .from(leadSignals)
    .innerJoin(signals, eq(signals.id, leadSignals.signalId))
    .where(eq(leadSignals.leadId, row.lead.id))
    .orderBy(desc(signals.detectedAt))
    .limit(1);
  await recordLearning(agencyId, row.send.clientId, {
    signal_key: sig?.key ?? row.play?.signalKey ?? null,
    play_id: row.draft.playId,
    persona: personaOf(row.lead.title),
    vertical: row.company.vertical,
    language: row.draft.language,
    subject: row.send.subject,
    score: row.send.scoreAtSend,
    reply_class: replyClass,
  });
}

/** Manual reply logging from the dashboard (when replies arrive outside the tracking alias). */
export async function setReplyClass(agencyId: string, userId: string, sendId: string, replyClass: ReplyClass) {
  const [s] = await db
    .update(sends)
    .set({ replyClass, repliedAt: sql`coalesce(${sends.repliedAt}, now())` })
    .where(and(eq(sends.agencyId, agencyId), eq(sends.id, sendId)))
    .returning();
  if (!s) throw new SendError("Send not found");
  if (replyClass === "unsubscribe") await suppress(agencyId, s.toEmail, "Marked unsubscribe");
  await db.update(leads).set({ status: replyClass === "unsubscribe" ? "closed" : "replied" }).where(eq(leads.id, s.leadId));
  await learnFromSend(agencyId, s.id, replyClass);
  await audit({ agencyId, userId, action: "send.reply_classified", entity: "send", entityId: s.id, meta: { replyClass } });
  return s;
}
