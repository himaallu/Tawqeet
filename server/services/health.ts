import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { mailboxes, sends } from "../db/schema";
import { audit } from "../lib/audit";

/**
 * Auto-pause a mailbox if bounces exceed 3% of the day's sends, or on any spam-complaint signal
 * (a reply that says it was reported as spam). Runs daily, and after each bounce.
 */
export const BOUNCE_LIMIT = 0.03;
const COMPLAINT = /\b(spam|reported|report(ing)? you|junk)\b|بريد مزعج|سبام/i;

export async function checkMailboxHealth(now = new Date()) {
  const since = new Date(now.getTime() - 86_400_000);
  const rows = await db
    .select({
      mailboxId: sends.mailboxId,
      sent: sql<number>`count(*) filter (where ${sends.status} in ('sent','bounced'))`,
      bounced: sql<number>`count(*) filter (where ${sends.status} = 'bounced')`,
      complaints: sql<number>`count(*) filter (where ${sends.replyText} ~* ${COMPLAINT.source.replace(/\\b/g, "\\y")})`,
    })
    .from(sends)
    .where(gte(sends.createdAt, since))
    .groupBy(sends.mailboxId);

  const paused: string[] = [];
  for (const r of rows) {
    const sent = Number(r.sent);
    const bounceRate = sent ? Number(r.bounced) / sent : 0;
    const reason =
      Number(r.complaints) > 0 ? "Spam complaint signal in the last 24 hours" : bounceRate > BOUNCE_LIMIT ? `Bounce rate ${(bounceRate * 100).toFixed(1)}% in the last 24 hours (limit 3%)` : null;
    if (!reason) continue;
    const [mb] = await db
      .update(mailboxes)
      .set({ status: "paused", pausedReason: reason })
      .where(and(eq(mailboxes.id, r.mailboxId), eq(mailboxes.status, "connected")))
      .returning();
    if (mb) {
      paused.push(mb.id);
      await audit({ agencyId: mb.agencyId, action: "mailbox.auto_paused", entity: "mailbox", entityId: mb.id, meta: { reason } });
    }
  }
  return { checked: rows.length, paused };
}
