import { and, eq } from "drizzle-orm";
import { db, clients, caseStudies } from "@workspace/db";
import { clientProfile, getLearnings } from "./profile";
import { BrainError } from "./errors";

/**
 * Phase 4 must use this boundary, never raw case_studies/website brain_entries.
 * It excludes unapproved evidence and removes private customer names before prompting.
 */
export async function getBrainWriterContext(agencyId: string, clientId: string, vertical: string) {
  const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.agencyId, agencyId))).limit(1);
  if (!client) throw new BrainError(404, "Client not found.");
  const [studies, learnings] = await Promise.all([
    db.select().from(caseStudies).where(and(eq(caseStudies.agencyId, agencyId), eq(caseStudies.clientId, clientId), eq(caseStudies.approved, true))),
    getLearnings(agencyId, clientId, vertical.trim()),
  ]);
  // Profile proof notes can duplicate a website's UNAPPROVED case-study claims.
  // Only the separately approved structured cases below are citable evidence.
  const { proofPoints: _unreviewedProofNotes, ...profile } = clientProfile(client);
  return {
    profile,
    caseStudies: studies.map(study => {
      const vertical = study.customerVertical.replace(/\s+company$/i, "");
      const anonymous = `a ${[study.customerCountry, vertical, "company", study.customerSizeBand ? `with ${study.customerSizeBand}` : ""].filter(Boolean).join(" ")}`;
      const customer = study.canNameCustomer && study.customerName ? study.customerName : anonymous;
      const scrub = (value: string) => study.canNameCustomer || !study.customerName
        ? value : value.replace(new RegExp(study.customerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), anonymous);
      return {
        id: study.id, customer, customerVertical: study.customerVertical, customerCountry: study.customerCountry,
        customerSizeBand: study.customerSizeBand, problem: scrub(study.problem), solution: scrub(study.solution),
        resultMetric: scrub(study.resultMetric), resultValue: scrub(study.resultValue), timeframe: scrub(study.timeframe),
        quote: scrub(study.quote), quotePersonTitle: scrub(study.quotePersonTitle), language: study.language,
      };
    }),
    learnings: learnings.map(row => row.meta),
  };
}
