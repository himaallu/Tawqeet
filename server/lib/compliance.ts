import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { suppression } from "../db/schema";

/** B2B work emails only: these consumer domains are never contacted. */
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com",
  "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com",
  "gmx.net", "mail.com", "yandex.com", "yandex.ru", "zoho.com", "hotmail.co.uk", "rocketmail.com",
  "emirates.net.ae", "eim.ae",
]);

export const domainOf = (email: string) => email.split("@")[1]?.toLowerCase().trim() ?? "";

export function isFreeMail(email: string): boolean {
  return FREE_MAIL_DOMAINS.has(domainOf(email));
}

/** Checks the agency's list and the global list, by exact email or whole domain. */
export async function isSuppressed(agencyId: string, email: string): Promise<boolean> {
  const e = email.toLowerCase().trim();
  const rows = await db
    .select({ id: suppression.id })
    .from(suppression)
    .where(
      and(
        or(eq(suppression.agencyId, agencyId), isNull(suppression.agencyId)),
        or(eq(suppression.email, e), eq(suppression.domain, domainOf(e))),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function suppress(agencyId: string | null, email: string, reason: string) {
  const e = email.toLowerCase().trim();
  if (agencyId && (await isSuppressed(agencyId, e))) return;
  await db.insert(suppression).values({ agencyId, email: e, reason });
}

/** Why an address may not be contacted, or null if it may. */
export async function contactBlockReason(agencyId: string, email: string | null): Promise<string | null> {
  if (!email) return "No email address";
  if (isFreeMail(email)) return "Free-mail address (B2B work emails only)";
  if (await isSuppressed(agencyId, email)) return "On the suppression list";
  return null;
}
