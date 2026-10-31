import { and, count, countDistinct, eq, gte } from "drizzle-orm";
import { PLAN } from "../../shared/enums";
import { db } from "../db";
import { agencies, clients, simRuns } from "../db/schema";

/**
 * Plan limits. Agency plan: 5 client workspaces + 2,500 simulated emails a month, plus paid
 * extra clients and simulation packs. Trial: 2 clients, 100 simulated emails.
 */
export const TRIAL = { clients: 2, simulations: 100 };

const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function usageFor(agencyId: string) {
  const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
  const paid = agency.plan === "agency" && ["active", "trialing", null].includes(agency.subscriptionStatus);
  const [{ n: clientCount }] = await db.select({ n: count() }).from(clients).where(eq(clients.agencyId, agencyId));
  const [{ n: simulated }] = await db
    .select({ n: countDistinct(simRuns.draftId) })
    .from(simRuns)
    .where(and(eq(simRuns.agencyId, agencyId), gte(simRuns.createdAt, monthStart())));
  const clientLimit = paid ? PLAN.includedClients + agency.extraClients : TRIAL.clients;
  const simLimit = (paid ? PLAN.includedSimulations : TRIAL.simulations) + agency.simPackCredits;
  return { plan: agency.plan, paid, clients: clientCount, clientLimit, simulated, simLimit };
}

export class LimitError extends Error {
  status = 402;
}

export async function assertCanAddClient(agencyId: string) {
  const u = await usageFor(agencyId);
  if (u.clients >= u.clientLimit) {
    throw new LimitError(`Your plan includes ${u.clientLimit} client workspaces. Add an extra client in Billing to continue.`);
  }
}

export async function assertCanSimulate(agencyId: string, drafts: number) {
  const u = await usageFor(agencyId);
  if (u.simulated + drafts > u.simLimit) {
    throw new LimitError(`Simulation limit reached (${u.simulated}/${u.simLimit} this month). Buy a simulation pack in Billing.`);
  }
}
