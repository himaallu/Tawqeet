import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool, agencies, clients, companies, leads, signals, signalDefinitions, signalReceipts } from "@workspace/db";
import catalogue from "./definitions.json" with { type: "json" };
import { seedSignalDefinitions } from "./catalog";
import { cappedScore, decayedPoints, gccCountry, leadEvidence } from "./scoring";
import { validateEvent, ingestArticle, type ClassifiedEvent } from "./classifier";
import { textChangeRatio, parseFeed, oceanPlans } from "./collectors";

after(() => pool.end());
const definition = (key: string) => {
  const d = catalogue.find(x => x.key === key)!;
  return { id: randomUUID(), key: d.key, name: d.name, description: d.description, sourceType: d.source_types[0]!,
    sourceTypes: d.source_types, baseWeight: d.base_weight, halfLifeDays: d.half_life_days, verticalMultipliers: d.vertical_multipliers,
    keywordsEn: d.keywords_en, keywordsAr: d.keywords_ar, targetPersonas: d.target_personas, exclusions: d.exclusions,
    playHint: d.play_hint, isNegative: d.is_negative, active: true, scope: (key === "regulation_change" ? "industry" : "company") as "company" | "industry" };
};
test("catalogue is exactly the supplied JSON with only the two requested overrides", async () => {
  const md = await readFile(new URL("../../../../../docs/Tawqeet_Signal_Definitions.md", import.meta.url), "utf8");
  const source = JSON.parse(md.match(/```json\s*([\s\S]*?)```/)![1]!);
  source.find((s: { key: string }) => s.key === "hiring_sales_role").base_weight = 35;
  source.find((s: { key: string }) => s.key === "hiring_surge").base_weight = 30;
  assert.deepEqual(catalogue, source);
  assert.equal(catalogue.length, 20);
  assert.equal(new Set(catalogue.map(d => d.key)).size, 20);
  assert.equal(definition("hiring_sales_role").halfLifeDays, 30);
  assert.equal(definition("hiring_surge").halfLifeDays, 21);
});
test("decay, vertical multipliers, negative weights and both score caps", () => {
  const now = new Date("2026-10-31T00:00:00Z"), past = new Date("2026-10-01T00:00:00Z");
  assert.equal(decayedPoints(definition("hiring_sales_role"), now, "saas", now), 35);
  assert.equal(decayedPoints(definition("hiring_sales_role"), past, "saas", now), 17.5);
  assert.equal(decayedPoints(definition("hiring_sales_role"), now, "re", now), 24.5);
  assert.equal(decayedPoints(definition("layoffs_or_freeze"), now, "saas", now), -25);
  assert.equal(decayedPoints({ ...definition("funding_round"), active: false }, now, null, now), 0);
  assert.deepEqual(cappedScore(90, 80), { signalPoints: 50, totalScore: 100 });
  assert.deepEqual(cappedScore(-25, 10), { signalPoints: -25, totalScore: 0 });
  for (const c of ["AE", "UAE", "United Arab Emirates", "الإمارات", "SA", "KSA", "Qatar", "Kuwait", "Bahrain", "Oman"]) assert.ok(gccCountry(c));
  assert.equal(gccCountry("US"), null);
});
test("classifier drops low confidence, missing dates/companies, non-GCC, exclusions and invented quotes", () => {
  const article = { title: "Funding", text: "Acme raised funding in UAE on 2026-10-30.", url: "https://example.com/news", sourceType: "news" };
  const event: ClassifiedEvent = { event_type: "funding_round", confidence: 0.9, company_name: "Acme", country: "UAE",
    date: "2026-10-30", evidence_quote: "Acme raised funding", affected_industries: [], affected_countries: [],
    excluded: false, exclusion_reason: null };
  const d = definition("funding_round"), now = new Date("2026-10-31");
  assert.ok(validateEvent(event, d, article, now));
  for (const patch of [{ confidence: 0.59 }, { company_name: null }, { date: null }, { date: "2026-02-30" },
    { date: "2030-01-01" }, { country: "USA" }, { excluded: true }, { evidence_quote: "invented result" }]) {
    assert.equal(validateEvent({ ...event, ...patch }, d, article, now), false);
  }
  assert.equal(validateEvent(event, { ...d, active: false }, article, now), false);
  assert.equal(validateEvent(event, { ...d, exclusions: ["raised funding"] }, article, now), false);
  const regulation = { ...event, event_type: "regulation_change", company_name: null, affected_industries: ["SaaS"], affected_countries: ["AE"] };
  assert.ok(validateEvent(regulation, definition("regulation_change"), article, now));
  assert.equal(validateEvent({ ...regulation, affected_countries: ["US"] }, definition("regulation_change"), article, now), false);
  assert.equal(validateEvent({ ...regulation, affected_industries: [] }, definition("regulation_change"), article, now), false);
});
test("page diff ignores sub-15% edits and feed parsing preserves Arabic and publication dates", () => {
  const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
  assert.ok(textChangeRatio(text, text.replace("word5 ", "newword ")) < 0.15);
  assert.ok(textChangeRatio(text, text.split(" ").slice(20).join(" ")) >= 0.15);
  assert.equal(textChangeRatio("", ""), 0);
  const items = parseFeed(`<rss><channel><item><title>تمويل جديد</title><link>https://example.com/news</link><description><![CDATA[<p>خبر من الإمارات</p>]]></description><pubDate>Fri, 30 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`);
  assert.equal(items.length, 1);
  assert.match(items[0]!.text, /الإمارات/);
  assert.match(items[0]!.publishedAt!, /^2026-10-30/);
});
test("weekly LeadOcean plans use documented hiring, funding, executive and technology filters", () => {
  const plans = oceanPlans(["acme.example"], ["Salesforce"]);
  assert.deepEqual(plans.map(p => p.name), ["hiring", "funding", "executive", "technographic"]);
  assert.ok(plans.every(p => p.filters.hqCountry.includes("AE") && p.filters.domain.length === 1));
  assert.equal(oceanPlans(["acme.example"], []).length, 3);
});
test("successful no-event articles are receipted so repeated feeds do not repeat AI work", async () => {
  const [agency] = await db.select().from(agencies).limit(1);
  assert.ok(agency);
  const article = { title: "Receipt regression", text: randomUUID(), url: "https://example.com/receipt-regression", sourceType: "news" };
  const fingerprint = createHash("sha256").update(JSON.stringify([article.url, article.text, article.sourceType, null])).digest("hex");
  let calls = 0;
  const classify = async () => { calls++; return []; };
  try {
    assert.equal(await ingestArticle(agency.id, article, classify), 0);
    assert.equal(await ingestArticle(agency.id, article, classify), 0);
    assert.equal(calls, 1);
  } finally {
    await db.delete(signalReceipts).where(and(eq(signalReceipts.agencyId, agency.id), eq(signalReceipts.fingerprint, fingerprint)));
  }
});
test("upsert is idempotent; shared industry evidence matches tenant, country and client vertical; edits rescore", async () => {
  const rollback = new Error("ROLLBACK_TEST_ONLY");
  await assert.rejects(db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(842733)`);
    await seedSignalDefinitions(tx);
    await seedSignalDefinitions(tx);
    const defs = await tx.select().from(signalDefinitions);
    assert.equal(defs.length, 20);
    assert.equal(defs.find(d => d.key === "hiring_sales_role")!.baseWeight, 35);
    assert.equal(defs.find(d => d.key === "hiring_surge")!.baseWeight, 30);
    const [agency] = await tx.select().from(agencies).limit(1);
    assert.ok(agency);
    const [client] = await tx.insert(clients).values({ agencyId: agency.id, name: "Signal regression SaaS", verticals: ["SaaS"] }).returning();
    const [hr] = await tx.insert(clients).values({ agencyId: agency.id, name: "Signal regression HR", verticals: ["HR"] }).returning();
    const [ae, sa] = await tx.insert(companies).values([
      { agencyId: agency.id, name: "Signal regression AE", country: "AE", vertical: "Technology" },
      { agencyId: agency.id, name: "Signal regression SA", country: "SA", vertical: "Technology" },
    ]).returning();
    const rows = await tx.insert(leads).values([
      { agencyId: agency.id, clientId: client!.id, companyId: ae!.id, fullName: "AE SaaS", fitScore: 60 },
      { agencyId: agency.id, clientId: client!.id, companyId: sa!.id, fullName: "SA SaaS" },
      { agencyId: agency.id, clientId: hr!.id, companyId: ae!.id, fullName: "AE HR" },
    ]).returning();
    const external = randomUUID();
    await tx.insert(signals).values([
      { agencyId: agency.id, companyId: null, definitionKey: "regulation_change", scope: "industry",
        affectedCountries: ["AE"], affectedIndustries: ["SaaS"], evidenceQuote: "New SaaS law in the UAE", title: "Regression regulation", externalKey: external },
      { agencyId: agency.id, companyId: ae!.id, definitionKey: "funding_round", title: "Regression funding" },
      { agencyId: agency.id, companyId: ae!.id, definitionKey: "layoffs_or_freeze", title: "Regression layoffs" },
    ]);
    const duplicate = await tx.insert(signals).values({ agencyId: agency.id, companyId: null, definitionKey: "regulation_change",
      scope: "industry", affectedCountries: ["AE"], affectedIndustries: ["SaaS"], title: "Duplicate", externalKey: external })
      .onConflictDoNothing().returning();
    assert.equal(duplicate.length, 0);
    const evidence = (await leadEvidence(agency.id, tx, true)).filter(l => rows.some(r => r.id === l.id));
    assert.equal(evidence[0]!.totalScore, 95);
    assert.equal(evidence[0]!.signals.length, 3);
    assert.equal(evidence[1]!.signals.length, 0);
    assert.equal(evidence[2]!.signals.length, 2); // Company evidence applies, industry regulation does not.
    await tx.insert(signals).values({ agencyId: agency.id, companyId: ae!.id, definitionKey: "champion_job_change",
      title: "Private champion", raw: { client_id: hr!.id, lead_id: rows[2]!.id } });
    const privateEvidence = await leadEvidence(agency.id, tx);
    assert.equal(privateEvidence.find(l => l.id === rows[0]!.id)!.signals.length, 3);
    assert.equal(privateEvidence.find(l => l.id === rows[2]!.id)!.signals.length, 3);
    assert.deepEqual(await leadEvidence(randomUUID(), tx), []);
    await tx.update(signalDefinitions).set({ active: false }).where(eq(signalDefinitions.key, "regulation_change"));
    await leadEvidence(agency.id, tx, true);
    const [updated] = await tx.select().from(leads).where(eq(leads.id, rows[0]!.id));
    assert.equal(updated!.tempScore, 70);
    const persisted = await tx.select().from(signals).where(and(eq(signals.agencyId, agency.id), eq(signals.externalKey, external)));
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]!.companyId, null);
    throw rollback;
  }), error => error === rollback);
});
