import { and, eq, isNull, or, gte, count } from "drizzle-orm";
import { db, suppression, auditLog, sends } from "@workspace/db";

export const FREE_MAIL_DOMAINS = ["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com"];
export const DAILY_CAP = 30;
export const DEFAULT_LEGAL_BASIS = "B2B legitimate interest";
export const OPT_OUT_PATTERN = /reply no|won.t follow|unsubscribe|opt.?out|reply .?stop|لن أتابع|توقف|إلغاء الاشتراك/i;

export const domainOf = (value: string) => (value.includes("@") ? value.split("@")[1]! : value).toLowerCase().trim().replace(/^www\./, "");
export const isFreeMail = (email: string) => {
  const d = domainOf(email);
  return FREE_MAIL_DOMAINS.includes(d) || /^yahoo\./.test(d) || /^hotmail\./.test(d);
};
export const hasOptOut = (body: string) => OPT_OUT_PATTERN.test(body);

export async function suppressedBy(agencyId: string, email: string | null, domain: string | null): Promise<string | null> {
  const targets = [email ? eq(suppression.email, email.toLowerCase().trim()) : undefined,
    email ? eq(suppression.domain, domainOf(email)) : undefined,
    domain ? eq(suppression.domain, domainOf(domain)) : undefined].filter(Boolean);
  if (!targets.length) return null;
  const [row] = await db.select().from(suppression)
    .where(and(or(eq(suppression.agencyId, agencyId), isNull(suppression.agencyId)), or(...targets))).limit(1);
  return row ? (row.email || row.domain) : null;
}

/** Reasons a message to this contact must not be sent; empty when allowed. */
export async function blockReasons(agencyId: string, opts: { email: string | null; domain: string | null; body?: string }) {
  const reasons: string[] = [];
  if (opts.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opts.email)) reasons.push("Not a valid email address");
  if (opts.email && isFreeMail(opts.email)) reasons.push(`Free-mail domain (${domainOf(opts.email)}): B2B work addresses only`);
  const hit = await suppressedBy(agencyId, opts.email, opts.domain);
  if (hit) reasons.push(`Suppressed contact (${hit})`);
  if (opts.body !== undefined && !hasOptOut(opts.body)) reasons.push("Opt-out line is missing");
  return reasons;
}

export async function sentToday(agencyId: string) {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const [row] = await db.select({ n: count() }).from(sends).where(and(eq(sends.agencyId, agencyId), gte(sends.sentAt, start)));
  return Number(row?.n ?? 0);
}

export async function audit(agencyId: string, userId: string | null, action: string, target: string, meta: Record<string, unknown> = {}) {
  try { await db.insert(auditLog).values({ agencyId, userId, action, target, meta }); } catch { /* audit must never break the action */ }
}
