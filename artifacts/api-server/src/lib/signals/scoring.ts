import { and, eq } from "drizzle-orm";
import { db, clients, companies, leads, signals, signalDefinitions } from "@workspace/db";

export type SignalDb = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;
type Definition = typeof signalDefinitions.$inferSelect;
type Signal = typeof signals.$inferSelect;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const countryAliases: Record<string, string[]> = {
  AE: ["ae", "uae", "u.a.e.", "united arab emirates", "الإمارات", "الإمارات العربية المتحدة"],
  SA: ["sa", "ksa", "saudi arabia", "saudi", "السعودية", "المملكة العربية السعودية"],
  QA: ["qa", "qatar", "قطر"], KW: ["kw", "kuwait", "الكويت"],
  BH: ["bh", "bahrain", "البحرين"], OM: ["om", "oman", "عمان", "سلطنة عمان"],
};
export function gccCountry(s: string | null | undefined): string | null {
  const n = norm(s || "");
  return Object.entries(countryAliases).find(([, names]) => names.includes(n))?.[0] ?? null;
}
export function verticalKey(s: string): "saas" | "re" | "hr" | null {
  const n = norm(s);
  if (/\b(saas|software|technology|tech|it|cloud)\b|تقنية|برمجيات/.test(n)) return "saas";
  if (/\b(re|real estate|construction|property|properties)\b|عقار|بناء|إنشاء/.test(n)) return "re";
  if (/\b(hr|recruitment|human resources|staffing|talent)\b|توظيف|موارد بشرية/.test(n)) return "hr";
  return null;
}
export function industryMatches(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || (verticalKey(x) !== null && verticalKey(x) === verticalKey(y)));
}
export function decayedPoints(def: Pick<Definition, "baseWeight" | "halfLifeDays" | "verticalMultipliers" | "isNegative" | "active">,
  date: Date, vertical: "saas" | "re" | "hr" | null, now = new Date()): number {
  if (!def.active || !Number.isFinite(date.getTime()) || def.halfLifeDays <= 0) return 0;
  const age = Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
  const weight = def.isNegative ? -Math.abs(def.baseWeight) : def.baseWeight;
  return weight * (vertical ? def.verticalMultipliers[vertical] : 1) * 0.5 ** (age / def.halfLifeDays);
}
export function cappedScore(points: number, fit = 0) {
  const signalPoints = Math.min(50, points);
  return { signalPoints: Math.round(signalPoints * 100) / 100, totalScore: Math.max(0, Math.min(100, Math.round(fit + signalPoints))) };
}
export function matchesIndustry(signal: Signal, company: typeof companies.$inferSelect, client: typeof clients.$inferSelect) {
  return signal.scope === "industry" && signal.affectedCountries.some(c => gccCountry(c) === gccCountry(company.country) && gccCountry(c) !== null)
    && signal.affectedIndustries.some(i => industryMatches(i, company.vertical || ""))
    && client.verticals.some(v => signal.affectedIndustries.some(i => industryMatches(i, v)));
}
export async function leadEvidence(agencyId?: string, conn: SignalDb = db, persist = false) {
  const rows = await conn.select({ lead: leads, company: companies, client: clients }).from(leads)
    .innerJoin(companies, and(eq(companies.id, leads.companyId), eq(companies.agencyId, leads.agencyId)))
    .innerJoin(clients, and(eq(clients.id, leads.clientId), eq(clients.agencyId, leads.agencyId)))
    .where(agencyId ? eq(leads.agencyId, agencyId) : undefined);
  const events = await conn.select({ signal: signals, definition: signalDefinitions }).from(signals)
    .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
    .where(agencyId ? eq(signals.agencyId, agencyId) : undefined);
  const now = new Date();
  const result = [];
  for (const { lead, company, client } of rows) {
    const vertical = verticalKey(company.vertical || "") ?? client.verticals.map(verticalKey).find(v => v !== null) ?? null;
    const eligible = events.filter(({ signal, definition }) => signal.agencyId === lead.agencyId && definition.active
      && (definition.key !== "champion_job_change" || ((signal.raw as Record<string, unknown>).client_id === client.id
        && (signal.raw as Record<string, unknown>).lead_id === lead.id))
      && (signal.companyId === company.id || matchesIndustry(signal, company, client)))
    const matched = eligible.map(({ signal, definition }) => ({
        id: signal.id, name: definition.name, title: signal.title, evidenceQuote: signal.evidenceQuote,
        url: signal.url, detectedAt: signal.detectedAt.toISOString(),
        points: Math.round(decayedPoints(definition, signal.detectedAt, vertical, now) * 100) / 100,
      }));
    // Sum full precision; display rounding must not change thermometer arithmetic.
    const points = eligible.reduce((sum, { signal, definition }) => sum + decayedPoints(definition, signal.detectedAt, vertical, now), 0);
    const score = cappedScore(points, lead.fitScore);
    if (persist) await conn.update(leads).set({ tempScore: score.totalScore,
      temperature: score.totalScore >= 70 ? "hot" : score.totalScore >= 35 ? "warm" : "cold" })
      .where(and(eq(leads.id, lead.id), eq(leads.agencyId, lead.agencyId)));
    result.push({ id: lead.id, fullName: lead.fullName, companyName: company.name, clientName: client.name, ...score, signals: matched });
  }
  return result;
}
