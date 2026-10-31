import { and, eq, gte, count } from "drizzle-orm";
import { db, clients, simRuns } from "@workspace/db";

export const PLAN = { name: "Agency", priceUsd: 399, includedClients: 5, extraClientUsd: 59, simulationAllowance: 300 } as const;
export const UPGRADE_MESSAGE = "Upgrade in Settings → Billing.";

export async function clientCount(agencyId: string) {
  const [row] = await db.select({ n: count() }).from(clients).where(eq(clients.agencyId, agencyId));
  return Number(row?.n ?? 0);
}
/** One simulation = one spam-check sim_run (written once per simulated draft). */
export async function simulationsThisMonth(agencyId: string) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const [row] = await db.select({ n: count() }).from(simRuns)
    .where(and(eq(simRuns.agencyId, agencyId), eq(simRuns.check, "spam"), gte(simRuns.createdAt, start)));
  return Number(row?.n ?? 0);
}
/** Returns an upgrade message when the plan limit is reached, otherwise null. */
export async function simulationLimitReached(agencyId: string, needed = 1): Promise<string | null> {
  const used = await simulationsThisMonth(agencyId);
  return used + needed > PLAN.simulationAllowance
    ? `Plan limit reached: ${used}/${PLAN.simulationAllowance} simulated emails this month. ${UPGRADE_MESSAGE}` : null;
}
export async function clientLimitReached(agencyId: string): Promise<string | null> {
  return await clientCount(agencyId) >= PLAN.includedClients
    ? `Plan limit reached: your plan includes ${PLAN.includedClients} client workspaces. ${UPGRADE_MESSAGE}` : null;
}
