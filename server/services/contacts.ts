import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { alertsSent, companies, drafts, leads, sends, simRuns } from "../db/schema";
import { audit } from "../lib/audit";
import { suppress } from "../lib/compliance";

/** Data export and delete per contact (by email, within the agency). */
export async function exportContact(agencyId: string, email: string) {
  const e = email.toLowerCase().trim();
  const leadRows = await db
    .select({ lead: leads, company: companies })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(leads.agencyId, agencyId), eq(leads.email, e)));
  const ids = leadRows.map((r) => r.lead.id);
  const sendRows = ids.length ? await db.select().from(sends).where(inArray(sends.leadId, ids)) : [];
  const draftRows = ids.length ? await db.select().from(drafts).where(inArray(drafts.leadId, ids)) : [];
  return {
    email: e,
    exportedAt: new Date().toISOString(),
    leads: leadRows.map(({ lead, company }) => ({
      fullName: lead.fullName,
      title: lead.title,
      email: lead.email,
      linkedinUrl: lead.linkedinUrl,
      company: company.name,
      status: lead.status,
      legalBasis: lead.legalBasis,
      consentNote: lead.consentNote,
      whyNow: lead.whyNow,
      createdAt: lead.createdAt,
    })),
    emails: sendRows.map((s) => ({ subject: s.subject, body: s.body, status: s.status, sentAt: s.sentAt, replyClass: s.replyClass, replyText: s.replyText })),
    drafts: draftRows.length,
  };
}

/** Erases the contact's personal data and suppresses the address so they're never contacted again. */
export async function deleteContact(agencyId: string, userId: string, email: string) {
  const e = email.toLowerCase().trim();
  const rows = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.agencyId, agencyId), eq(leads.email, e)));
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const draftIds = (await db.select({ id: drafts.id }).from(drafts).where(inArray(drafts.leadId, ids))).map((d) => d.id);
    await db.delete(sends).where(inArray(sends.leadId, ids));
    if (draftIds.length) await db.delete(simRuns).where(inArray(simRuns.draftId, draftIds));
    await db.delete(alertsSent).where(inArray(alertsSent.leadId, ids));
    await db.delete(leads).where(inArray(leads.id, ids));
  }
  await suppress(agencyId, e, "Erasure request");
  await audit({ agencyId, userId, action: "contact.deleted", entity: "contact", entityId: null, meta: { leads: ids.length, domain: e.split("@")[1] } });
  return { deleted: ids.length };
}
