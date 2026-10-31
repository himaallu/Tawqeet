import { eq, sql } from "drizzle-orm";
import { db, signalDefinitions, signals, plays } from "@workspace/db";
import definitions from "./definitions.json" with { type: "json" };
import { leadEvidence, type SignalDb } from "./scoring";

export const SIGNAL_KEYS = definitions.map(d => d.key);
export async function seedSignalDefinitions(conn: SignalDb = db) {
  for (const d of definitions) {
    const values = { key: d.key, name: d.name, description: d.description, sourceType: d.source_types[0]!,
      sourceTypes: d.source_types, baseWeight: d.base_weight, halfLifeDays: d.half_life_days,
      verticalMultipliers: d.vertical_multipliers, targetPersonas: d.target_personas,
      keywordsEn: d.keywords_en, keywordsAr: d.keywords_ar, exclusions: d.exclusions,
      playHint: d.play_hint, isNegative: d.is_negative, scope: ("scope" in d && d.scope === "industry") ? "industry" as const : "company" as const,
    };
    await conn.insert(signalDefinitions).values(values).onConflictDoUpdate({ target: signalDefinitions.key, set: values });
  }
  // Preserve placeholder references before replacing their definitions. Keep the
  // original key in raw evidence so this catalogue migration is auditable.
  const legacy = { hiring_relevant_role: "hiring_surge", careers_page_new_roles: "hiring_surge", office_opening: "expansion_new_market" };
  for (const [old, replacement] of Object.entries(legacy)) {
    await conn.update(signals).set({ definitionKey: replacement, raw: sql`${signals.raw} || jsonb_build_object('legacy_definition_key', ${old}::text)` }).where(eq(signals.definitionKey, old));
    await conn.update(plays).set({ signalKey: replacement }).where(eq(plays.signalKey, old));
    await conn.delete(signalDefinitions).where(eq(signalDefinitions.key, old));
  }
}
export async function installCatalogue() {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(842733)`);
    await seedSignalDefinitions(tx);
    await leadEvidence(undefined, tx, true);
  });
}
