import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Temperature } from "../../shared/enums";
import { db } from "../db";
import { clientAccounts, leads, leadSignals, sends, signalDefinitions, signals } from "../db/schema";
import { computeScore, type ScoredSignal } from "../lib/thermometer";

/** Signals older than this contribute < 2% of their weight even at the longest half-life. */
const LOOKBACK_DAYS = 365;

async function companySignals(companyId: string): Promise<ScoredSignal[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const rows = await db
    .select({
      id: signals.id,
      key: signals.definitionKey,
      title: signals.title,
      detectedAt: signals.detectedAt,
      baseWeight: signalDefinitions.baseWeight,
      halfLifeDays: signalDefinitions.halfLifeDays,
    })
    .from(signals)
    .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
    .where(and(eq(signals.companyId, companyId), gte(signals.detectedAt, since)));
  return rows;
}

async function engagementFor(leadIds: string[]) {
  if (!leadIds.length) return new Map<string, { replied: boolean; clicked: boolean }>();
  const rows = await db
    .select({
      leadId: sends.leadId,
      replied: sql<boolean>`bool_or(${sends.replyClass} in ('positive', 'neutral', 'negative'))`,
      clicked: sql<boolean>`bool_or(${sends.clicked})`,
    })
    .from(sends)
    .where(inArray(sends.leadId, leadIds))
    .groupBy(sends.leadId);
  return new Map(rows.map((r) => [r.leadId, { replied: !!r.replied, clicked: !!r.clicked }]));
}

export type Change = { leadId: string; before: Temperature; after: Temperature; score: number };

/** Recomputes an account and all its leads. Returns each lead's temperature change. */
export async function recomputeAccount(agencyId: string, accountId: string, now = new Date()): Promise<Change[]> {
  const [account] = await db
    .select()
    .from(clientAccounts)
    .where(and(eq(clientAccounts.agencyId, agencyId), eq(clientAccounts.id, accountId)));
  if (!account) return [];
  const sigs = await companySignals(account.companyId);
  const acc = computeScore(sigs, account.fit, undefined, now);
  await db
    .update(clientAccounts)
    .set({ tempScore: acc.total, temperature: acc.temperature, breakdown: acc })
    .where(eq(clientAccounts.id, account.id));

  const accountLeads = await db
    .select()
    .from(leads)
    .where(and(eq(leads.agencyId, agencyId), eq(leads.accountId, account.id)));
  const engagement = await engagementFor(accountLeads.map((l) => l.id));
  const changes: Change[] = [];
  for (const lead of accountLeads) {
    const s = computeScore(sigs, account.fit, engagement.get(lead.id), now);
    await db
      .update(leads)
      .set({ tempScore: s.total, temperature: s.temperature, breakdown: s, whyNow: lead.whyNow ?? account.whyNow })
      .where(eq(leads.id, lead.id));
    for (const sig of sigs) {
      await db.insert(leadSignals).values({ agencyId, leadId: lead.id, signalId: sig.id }).onConflictDoNothing();
    }
    changes.push({ leadId: lead.id, before: lead.temperature, after: s.temperature, score: s.total });
  }
  return changes;
}

/** Nightly decay: recompute every account so old signals cool down. */
export async function decayAll(now = new Date()): Promise<{ accounts: number; cooled: number }> {
  const rows = await db.select({ id: clientAccounts.id, agencyId: clientAccounts.agencyId }).from(clientAccounts);
  let cooled = 0;
  for (const r of rows) {
    const changes = await recomputeAccount(r.agencyId, r.id, now);
    cooled += changes.filter((c) => rank(c.after) < rank(c.before)).length;
  }
  return { accounts: rows.length, cooled };
}

export const rank = (t: Temperature) => (t === "hot" ? 2 : t === "warm" ? 1 : 0);
