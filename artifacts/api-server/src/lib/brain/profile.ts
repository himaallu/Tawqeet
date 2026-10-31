import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, brainEntries, caseStudies, clients } from "@workspace/db";
import { aiConfiguration } from "./extract";
import { hubspotConfigured } from "./crm";
import type { CrmRecord } from "./crm";

type Client = typeof clients.$inferSelect;
export function clientProfile(client: Client) {
  const icp = client.icp || {};
  const array = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return {
    offer: client.offer,
    whoYouSellTo: typeof icp.whoYouSellTo === "string" ? icp.whoYouSellTo : typeof icp.description === "string" ? icp.description : "",
    dealSize: typeof icp.dealSize === "string" ? icp.dealSize : "",
    topPains: array(icp.topPains).slice(0, 3),
    proofPoints: client.proofPoints,
    wordsToNeverUse: array(icp.wordsToNeverUse),
    languages: [...new Set(client.languages.map(l => /^(ar|arabic|العربية)$/i.test(l) ? "ar" as const : "en" as const))],
    tone: client.tone, differentiators: client.differentiators, noGoClaims: client.noGoClaims,
  };
}
export const serializeEntry = (entry: typeof brainEntries.$inferSelect) => ({
  id: entry.id, kind: entry.kind, content: entry.content, meta: entry.meta, createdAt: entry.createdAt.toISOString(),
});
export const serializeCase = (row: typeof caseStudies.$inferSelect) => ({
  id: row.id, customerName: row.customerName, customerVertical: row.customerVertical,
  customerCountry: row.customerCountry, customerSizeBand: row.customerSizeBand,
  problem: row.problem, solution: row.solution, resultMetric: row.resultMetric, resultValue: row.resultValue,
  timeframe: row.timeframe, quote: row.quote, quotePersonTitle: row.quotePersonTitle,
  canNameCustomer: row.canNameCustomer, language: row.language, source: row.source, sourceRef: row.sourceRef,
  approved: row.approved, createdAt: row.createdAt.toISOString(),
});
export async function getLearnings(agencyId: string, clientId: string, vertical?: string) {
  return db.select().from(brainEntries).where(and(
    eq(brainEntries.agencyId, agencyId), eq(brainEntries.clientId, clientId), eq(brainEntries.kind, "learning"),
    vertical !== undefined ? sql`lower(${brainEntries.meta}->>'vertical') = lower(${vertical})` : undefined,
  )).orderBy(desc(brainEntries.createdAt), desc(brainEntries.id)).limit(50);
}
export async function brainResponse(client: Client) {
  const scope = and(eq(brainEntries.agencyId, client.agencyId), eq(brainEntries.clientId, client.id));
  const [entries, studies, learnings, hubspot] = await Promise.all([
    db.select().from(brainEntries).where(and(scope, ne(brainEntries.kind, "learning"))).orderBy(desc(brainEntries.createdAt)).limit(50),
    db.select().from(caseStudies).where(and(eq(caseStudies.agencyId, client.agencyId), eq(caseStudies.clientId, client.id))).orderBy(desc(caseStudies.createdAt)),
    getLearnings(client.agencyId, client.id), hubspotConfigured(),
  ]);
  const ai = aiConfiguration();
  return {
    profile: clientProfile(client), entries: entries.map(serializeEntry), caseStudies: studies.map(serializeCase),
    learnings: learnings.map(serializeEntry),
    status: { aiConfigured: ai.configured, aiMessage: ai.message, hubspotConfigured: hubspot, storageConfigured: Boolean(process.env.PRIVATE_OBJECT_DIR) },
  };
}

/** Serialize imports per client so concurrent/repeated uploads cannot duplicate CRM sources. */
export async function saveCrmRecords(agencyId: string, clientId: string, records: CrmRecord[], source: "csv" | "hubspot") {
  return db.transaction(async tx => {
    await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.agencyId, agencyId))).for("update");
    const previous = await tx.select({ meta: brainEntries.meta }).from(brainEntries).where(and(
      eq(brainEntries.agencyId, agencyId), eq(brainEntries.clientId, clientId), eq(brainEntries.kind, "crm"),
    ));
    const existing = new Set(previous.map(p => (p.meta as Record<string, unknown>).external_id));
    let imported = 0;
    for (const record of records) {
      if (existing.has(record.externalId)) continue;
      existing.add(record.externalId);
      await tx.insert(brainEntries).values({
        agencyId, clientId, kind: "crm", content: JSON.stringify(record.data),
        meta: { source, external_id: record.externalId, record_type: record.type, industry: record.industry, ...record.data },
      });
      imported++;
    }
    return { imported, skipped: records.length - imported };
  });
}
