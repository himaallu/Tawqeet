import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { clientAccounts, clients, companies, leads, signalDefinitions, signals } from "../db/schema";
import { aiObject } from "../lib/ai";
import { contactBlockReason } from "../lib/compliance";
import { enrichment } from "../lib/enrichment";
import { enqueue, Q } from "../lib/jobs";
import { sha256 } from "../lib/scrape";
import { rank, recomputeAccount } from "./scoring";

/**
 * Event-driven pipeline per new signal:
 *   ingest → dedupe → classify (radar) → match to each client's ICP → recompute thermometer
 *   → if Warm/Hot: enrich-contacts → generate-drafts → simulate → status ready → alert
 */

export const MIN_FIT = 8; // below this the company isn't worth tracking for that client

const fitSchema = z.object({
  fit: z.number().int().min(0).max(25),
  reason: z.string(),
  why_now: z.string(),
});

type Client = typeof clients.$inferSelect;
type Company = typeof companies.$inferSelect;
type Signal = typeof signals.$inferSelect;

export function offlineFit(client: Client, company: Company, signal: Signal, signalName: string) {
  let fit = 6;
  const hay = `${company.name} ${company.vertical ?? ""} ${signal.title} ${signal.summary ?? ""}`.toLowerCase();
  if (!client.regions.length || (company.country && client.regions.includes(company.country))) fit += 7;
  for (const v of client.verticals) if (v && hay.includes(v.toLowerCase().split(/\s+/)[0])) fit += 6;
  for (const ind of client.icp.industries ?? []) if (hay.includes(ind.toLowerCase())) fit += 3;
  if (company.sizeBand && (client.icp.company_sizes ?? []).includes(company.sizeBand)) fit += 3;
  return {
    fit: Math.min(25, fit),
    reason: `Region ${company.country ?? "?"} and signal "${signalName}" match ${client.name}'s focus.`,
    why_now: `${signal.title}.`,
  };
}

export async function fitCheck(client: Client, company: Company, signal: Signal, signalName: string) {
  return aiObject({
    agencyId: client.agencyId,
    clientId: client.id,
    purpose: "pipeline.fit",
    tier: "fast",
    schema: fitSchema,
    system:
      "You judge whether a company is a good prospect for a B2B seller right now. " +
      "fit is 0–25: 0 = clearly outside the ICP, 25 = textbook ICP match. Be strict. " +
      "why_now is one short, factual sentence linking the signal to the seller's offer (no hype, no invented facts).",
    prompt: JSON.stringify({
      seller: { name: client.name, offer: client.offer, icp: client.icp, verticals: client.verticals, regions: client.regions },
      prospect: { name: company.name, domain: company.domain, country: company.country, vertical: company.vertical, size: company.sizeBand },
      signal: { type: signalName, title: signal.title, summary: signal.summary, detected: signal.detectedAt },
    }),
    offline: () => offlineFit(client, company, signal, signalName),
  });
}

export async function processSignal(signalId: string) {
  const [row] = await db
    .select({ signal: signals, company: companies, def: signalDefinitions })
    .from(signals)
    .innerJoin(companies, eq(companies.id, signals.companyId))
    .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
    .where(eq(signals.id, signalId));
  if (!row) return { matched: 0 };
  const { signal, company, def } = row;

  const candidates = (await db.select().from(clients)).filter(
    (c) => !c.regions.length || !company.country || c.regions.includes(company.country),
  );

  let matched = 0;
  for (const client of candidates) {
    const [existing] = await db
      .select()
      .from(clientAccounts)
      .where(and(eq(clientAccounts.clientId, client.id), eq(clientAccounts.companyId, company.id)));

    const fit = await fitCheck(client, company, signal, def.name);
    if (!existing && fit.fit < MIN_FIT) continue;

    const [account] = existing
      ? await db
          .update(clientAccounts)
          .set({ fit: Math.max(existing.fit, fit.fit), fitReason: fit.reason, whyNow: fit.why_now })
          .where(eq(clientAccounts.id, existing.id))
          .returning()
      : await db
          .insert(clientAccounts)
          .values({ agencyId: client.agencyId, clientId: client.id, companyId: company.id, fit: fit.fit, fitReason: fit.reason, whyNow: fit.why_now })
          .returning();
    matched++;

    // New signal = fresh reason to reach out; leads pick up the new why_now.
    await db.update(leads).set({ whyNow: fit.why_now }).where(eq(leads.accountId, account.id));
    const changes = await recomputeAccount(client.agencyId, account.id);
    const [fresh] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, account.id));
    if (fresh.temperature === "cold") continue;

    if (changes.length === 0) {
      await enqueue(Q.enrichContacts, { agencyId: client.agencyId, accountId: account.id }, { singletonKey: `enrich:${account.id}` });
      continue;
    }
    for (const c of changes) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, c.leadId));
      if (lead.status === "new") await enqueue(Q.generateDrafts, { agencyId: client.agencyId, leadId: lead.id });
      else if (lead.status === "ready" && rank(c.after) > rank(c.before)) await enqueue(Q.alert, { agencyId: client.agencyId, leadId: lead.id });
    }
  }
  return { matched };
}

const DEFAULT_TITLES = ["CEO", "Managing Director", "Head of Operations", "COO"];
export const MAX_CONTACTS_PER_ACCOUNT = 2;

/** 10% of leads go to the A/B challenger group (send the second-best variant). */
export const abGroupFor = (key: string) => (parseInt(sha256(key).slice(0, 8), 16) % 10 === 0 ? "challenger" : "control");

export async function enrichContacts(agencyId: string, accountId: string) {
  const [row] = await db
    .select({ account: clientAccounts, company: companies, client: clients })
    .from(clientAccounts)
    .innerJoin(companies, eq(companies.id, clientAccounts.companyId))
    .innerJoin(clients, eq(clients.id, clientAccounts.clientId))
    .where(and(eq(clientAccounts.agencyId, agencyId), eq(clientAccounts.id, accountId)));
  if (!row) return { created: 0 };
  const { account, company, client } = row;
  if (account.temperature === "cold") return { created: 0 };
  const provider = enrichment();
  if (!provider) return { created: 0, reason: "No enrichment provider configured" };

  if (company.domain && (!company.enrichedAt || Date.now() - company.enrichedAt.getTime() > 30 * 86_400_000)) {
    const info = await provider.enrichCompany(company.domain);
    if (info) {
      await db
        .update(companies)
        .set({
          sizeBand: company.sizeBand ?? info.sizeBand,
          vertical: company.vertical ?? info.industry,
          country: company.country ?? info.country,
          enrichment: { ...(company.enrichment ?? {}), technologies: info.technologies },
          enrichedAt: new Date(),
        })
        .where(eq(companies.id, company.id));
    }
  }

  const [{ n: existing }] = await db.select({ n: count() }).from(leads).where(eq(leads.accountId, account.id));
  const people = await provider.findPeople({
    domain: company.domain,
    company: company.name,
    country: company.country,
    titles: client.icp.titles?.length ? client.icp.titles : DEFAULT_TITLES,
  });

  const createdIds: string[] = [];
  for (const p of people) {
    if (existing + createdIds.length >= MAX_CONTACTS_PER_ACCOUNT) break;
    if (await contactBlockReason(agencyId, p.email)) continue;
    const [lead] = await db
      .insert(leads)
      .values({
        agencyId,
        clientId: client.id,
        companyId: company.id,
        accountId: account.id,
        fullName: p.fullName,
        title: p.title,
        email: p.email,
        linkedinUrl: p.linkedinUrl,
        emailVerified: p.emailStatus,
        whyNow: account.whyNow,
        language: client.languages.includes("ar") && company.country === "SA" && !client.languages.includes("en") ? "ar" : "en",
        abGroup: abGroupFor(`${client.id}:${p.email}`),
        consentNote: `B2B outreach on legitimate interest: ${account.whyNow ?? "recent business signal"}`,
      })
      .onConflictDoNothing()
      .returning();
    if (lead) createdIds.push(lead.id);
  }
  await db.update(clientAccounts).set({ enrichedAt: new Date() }).where(eq(clientAccounts.id, account.id));
  await recomputeAccount(agencyId, account.id);
  for (const leadId of createdIds) await enqueue(Q.generateDrafts, { agencyId, leadId });
  return { created: createdIds.length };
}
