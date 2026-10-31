import { and, eq, isNotNull, sql } from "drizzle-orm";
import Parser from "rss-parser";
import { z } from "zod";
import { db } from "../db";
import { clientAccounts, clients, companies, radarSources, signalDefinitions, signals } from "../db/schema";
import { aiObject } from "../lib/ai";
import { enrichment } from "../lib/enrichment";
import { enqueue, Q } from "../lib/jobs";
import { fetchRaw, scrape, sha256 } from "../lib/scrape";
import { GULF_COUNTRIES } from "../../shared/enums";

/**
 * Signal radar. Each job collects raw items, the AI turns each into a structured signal, and
 * every new signal is handed to the event-driven pipeline (process-signal).
 */

export type RawItem = { title: string; summary: string; url: string | null; source: string; publishedAt: Date | null; hint?: string };

const rss = new Parser({ timeout: 15_000 });

const extractionSchema = z.object({
  company_name: z.string().nullable(),
  domain_guess: z.string().nullable(),
  country: z.string().nullable(), // ISO alpha-2
  event_type: z.string(),
  summary: z.string(),
  language: z.enum(["en", "ar"]),
  is_gulf: z.boolean(),
});
export type Extraction = z.infer<typeof extractionSchema>;

async function activeDefinitions() {
  return db.select().from(signalDefinitions).where(eq(signalDefinitions.active, true));
}

/** Keyword classifier used in offline mode (and as a sanity floor). */
export function offlineClassify(item: RawItem, keys: string[]): Extraction {
  const t = `${item.title} ${item.summary}`;
  const lower = t.toLowerCase();
  const rules: [string, RegExp][] = [
    ["funding_round", /rais|funding|series [a-e]|seed round|investment round|تمويل|جولة/],
    ["tender_published", /tender|rfp|request for proposal|مناقصة/],
    ["leadership_change", /appoint|names .* (ceo|cfo|chief)|new (ceo|cfo|chief)|يعين|تعيين/],
    ["hiring_sales_role", /hiring .*sales|sales (director|manager|team)/],
    ["hiring_relevant_role", /hiring|recruit|jobs|roles|توظيف/],
    ["office_opening", /opens? (new )?(office|headquarter|hq)|regional (hq|headquarters)|مقر/],
    ["expansion_new_market", /expan|enter(s|ing)? .* market|launch(es)? in|توسع/],
    ["partnership_announced", /partner|mou|agreement|شراكة|اتفاقية/],
    ["product_launch", /launch|unveil|introduc|تطلق|إطلاق/],
    ["event_exhibitor", /gitex|cityscape|exhibit|leap|arab health|معرض/],
    ["new_company_registration", /registered|incorporat|new company|سجل تجاري/],
  ];
  const event = rules.find(([k, re]) => keys.includes(k) && re.test(lower))?.[0] ?? "none";
  const countries: [string, RegExp][] = [
    ["AE", /uae|dubai|abu dhabi|sharjah|emirates|الإمارات|دبي|أبوظبي/i],
    ["SA", /saudi|riyadh|jeddah|ksa|dammam|السعودية|الرياض|جدة/i],
    ["QA", /qatar|doha|قطر|الدوحة/i],
    ["KW", /kuwait|الكويت/i],
    ["BH", /bahrain|manama|البحرين/i],
    ["OM", /oman|muscat|عمان|مسقط/i],
  ];
  const country = countries.find(([, re]) => re.test(t))?.[0] ?? null;
  const company = item.title.match(/^([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})/)?.[1] ?? null;
  return {
    company_name: company,
    domain_guess: null,
    country,
    event_type: event,
    summary: item.summary.slice(0, 280) || item.title,
    language: /[؀-ۿ]/.test(t) ? "ar" : "en",
    is_gulf: country !== null,
  };
}

export async function classifyItem(item: RawItem, keys: string[]): Promise<Extraction> {
  return aiObject({
    agencyId: null,
    purpose: "radar.classify",
    tier: "fast",
    schema: extractionSchema,
    system:
      "You read one Gulf business news item and extract a sales signal. " +
      `event_type must be one of: ${keys.join(", ")}, or "none" if nothing fits. ` +
      "country is an ISO 3166 alpha-2 code. is_gulf is true only if the event happens in UAE, Saudi Arabia, Qatar, Kuwait, Bahrain or Oman. " +
      "company_name is the company the event is about (not the publisher). domain_guess is its website domain if you are confident, else null.",
    prompt: `${item.hint ? `Source type: ${item.hint}\n` : ""}Title: ${item.title}\nSummary: ${item.summary}\nURL: ${item.url ?? "-"}`,
    offline: () => offlineClassify(item, keys),
  });
}

const cleanDomain = (d: string | null) =>
  d
    ?.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim() || null;

export async function upsertCompany(input: { name: string; domain: string | null; country: string | null }) {
  const domain = cleanDomain(input.domain);
  if (domain) {
    const [row] = await db
      .insert(companies)
      .values({ name: input.name, domain, country: input.country })
      .onConflictDoUpdate({ target: companies.domain, set: { country: sql`coalesce(${companies.country}, excluded.country)` } })
      .returning();
    return row;
  }
  const [existing] = await db.select().from(companies).where(sql`lower(${companies.name}) = lower(${input.name})`).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(companies).values({ name: input.name, country: input.country }).returning();
  return row;
}

/** Ingest one raw item: classify → drop non-Gulf/unmatched → upsert company → insert signal (deduped). */
export async function ingestItem(item: RawItem): Promise<string | null> {
  if (item.url) {
    const [seen] = await db.select({ id: signals.id }).from(signals).where(eq(signals.url, item.url)).limit(1);
    if (seen) return null;
  }
  const defs = await activeDefinitions();
  const keys = defs.map((d) => d.key);
  const x = await classifyItem(item, keys);
  if (!x.is_gulf || !keys.includes(x.event_type) || !x.company_name) return null;
  if (x.country && !(GULF_COUNTRIES as readonly string[]).includes(x.country)) return null;

  const company = await upsertCompany({ name: x.company_name, domain: x.domain_guess, country: x.country });
  return insertSignal({
    companyId: company.id,
    definitionKey: x.event_type,
    title: item.title,
    summary: x.summary,
    url: item.url,
    source: item.source,
    language: x.language,
    detectedAt: item.publishedAt && item.publishedAt < new Date() ? item.publishedAt : new Date(),
    raw: { item, extraction: x },
  });
}

export async function insertSignal(s: {
  companyId: string;
  definitionKey: string;
  title: string;
  summary: string | null;
  url: string | null;
  source: string;
  language: string;
  detectedAt?: Date;
  raw?: unknown;
}): Promise<string | null> {
  const dedupeKey = sha256(`${s.url ?? s.title}|${s.companyId}|${s.definitionKey}`);
  const [row] = await db
    .insert(signals)
    .values({ ...s, dedupeKey, detectedAt: s.detectedAt ?? new Date(), raw: s.raw ?? null })
    .onConflictDoNothing({ target: signals.dedupeKey })
    .returning({ id: signals.id });
  if (!row) return null;
  await enqueue(Q.processSignal, { signalId: row.id });
  return row.id;
}

// ---------- radar-news / radar-tenders ----------

/** Google News RSS queries per client vertical × country, built from every agency's clients. */
export async function googleNewsFeeds(): Promise<{ name: string; url: string }[]> {
  const rows = await db.select({ verticals: clients.verticals, regions: clients.regions }).from(clients);
  const queries = new Set<string>();
  for (const r of rows) {
    const places = (r.regions.length ? r.regions : ["AE"]).map((c) => (c === "SA" ? "Saudi" : c === "AE" ? "UAE" : c));
    for (const v of r.verticals.slice(0, 3)) for (const p of places.slice(0, 2)) queries.add(`${v} ${p}`);
  }
  return [...queries].slice(0, 30).map((q) => ({
    name: `Google News: ${q}`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-AE&gl=AE&ceid=AE:en`,
  }));
}

async function collectFeed(name: string, url: string, hint: string, since: Date): Promise<number> {
  const xml = await fetchRaw(url);
  const feed = await rss.parseString(xml);
  let created = 0;
  for (const it of feed.items.slice(0, 40)) {
    const publishedAt = it.isoDate ? new Date(it.isoDate) : null;
    if (publishedAt && publishedAt < since) continue;
    const id = await ingestItem({
      title: (it.title ?? "").trim(),
      summary: (it.contentSnippet ?? it.content ?? "").replace(/\s+/g, " ").trim().slice(0, 1000),
      url: it.link ?? null,
      source: name,
      publishedAt,
      hint,
    });
    if (id) created++;
  }
  return created;
}

export async function runFeedJob(job: "radar-news" | "radar-tenders"): Promise<{ sources: number; signals: number; errors: number }> {
  const sources = await db
    .select()
    .from(radarSources)
    .where(and(eq(radarSources.job, job), eq(radarSources.active, true)));
  const list: { id?: string; name: string; url: string; lastFetchedAt?: Date | null }[] = [...sources];
  if (job === "radar-news") list.push(...(await googleNewsFeeds()));

  let created = 0;
  let errors = 0;
  for (const s of list) {
    const since = s.lastFetchedAt ?? new Date(Date.now() - 2 * 86_400_000);
    try {
      created += await collectFeed(s.name, s.url, job === "radar-tenders" ? "tender portal / company registry" : "news", since);
      if (s.id) await db.update(radarSources).set({ lastFetchedAt: new Date(), lastError: null }).where(eq(radarSources.id, s.id));
    } catch (e) {
      errors++;
      if (s.id) await db.update(radarSources).set({ lastError: (e as Error).message.slice(0, 300) }).where(eq(radarSources.id, s.id));
    }
  }
  return { sources: list.length, signals: created, errors };
}

// ---------- radar-careers ----------

const SALES_ROLE = /sales|business development|account (executive|manager)|bdm|bdr|sdr|مبيعات|تطوير الأعمال/i;

export async function extractRoles(text: string): Promise<string[]> {
  const result = await aiObject({
    agencyId: null,
    purpose: "radar.careers",
    tier: "fast",
    schema: z.object({ roles: z.array(z.string()) }),
    system: "List the open job titles on this careers page. Titles only, one per item, no locations.",
    prompt: text.slice(0, 20_000),
    offline: () => ({
      roles: [
        ...new Set(
          text.match(/\b(?:Senior |Junior |Lead |Head of |Chief )?[A-Z][a-z]+(?: [A-Z][a-z]+){0,3} (?:Manager|Engineer|Director|Executive|Specialist|Analyst|Officer|Lead|Coordinator|Consultant)\b/g) ?? [],
        ),
      ],
    }),
  });
  return [...new Set(result.roles.map((r) => r.trim()).filter(Boolean))];
}

export async function runCareersJob(): Promise<{ checked: number; signals: number }> {
  const rows = await db.select().from(companies).where(isNotNull(companies.careersUrl));
  let created = 0;
  for (const c of rows) {
    try {
      const page = await scrape(c.careersUrl!);
      const hash = sha256(page.text);
      if (hash === c.careersHash) {
        await db.update(companies).set({ careersCheckedAt: new Date() }).where(eq(companies.id, c.id));
        continue; // unchanged: skip the AI call entirely
      }
      const roles = await extractRoles(page.text);
      const previous = ((c.enrichment?.careersRoles as string[] | undefined) ?? []).map((r) => r.toLowerCase());
      const fresh = roles.filter((r) => !previous.includes(r.toLowerCase()));
      await db
        .update(companies)
        .set({ careersHash: hash, careersCheckedAt: new Date(), enrichment: { ...(c.enrichment ?? {}), careersRoles: roles } })
        .where(eq(companies.id, c.id));
      if (!c.careersHash || fresh.length === 0) continue; // first snapshot is the baseline

      const day = new Date().toISOString().slice(0, 10);
      const sales = fresh.filter((r) => SALES_ROLE.test(r));
      if (sales.length) {
        if (
          await insertSignal({
            companyId: c.id,
            definitionKey: "hiring_sales_role",
            title: `${c.name} is hiring: ${sales.slice(0, 3).join(", ")}`,
            summary: `${sales.length} new sales role(s) on the careers page.`,
            url: `${c.careersUrl}#${day}-sales`,
            source: "careers page",
            language: "en",
          })
        )
          created++;
      }
      if (
        await insertSignal({
          companyId: c.id,
          definitionKey: "careers_page_new_roles",
          title: `${c.name} posted ${fresh.length} new role${fresh.length > 1 ? "s" : ""}`,
          summary: fresh.slice(0, 8).join(", "),
          url: `${c.careersUrl}#${day}`,
          source: "careers page",
          language: "en",
        })
      )
        created++;
    } catch (e) {
      console.warn(`[radar-careers] ${c.name}: ${(e as Error).message}`);
    }
  }
  return { checked: rows.length, signals: created };
}

// ---------- radar-people (weekly, paid credits) ----------

export async function runPeopleJob(): Promise<{ funded: number; leadership: number }> {
  const provider = enrichment();
  if (!provider) return { funded: 0, leadership: 0 };
  const rows = await db.select({ verticals: clients.verticals, regions: clients.regions }).from(clients);
  const countries = [...new Set(rows.flatMap((r) => r.regions))].filter((c) => (GULF_COUNTRIES as readonly string[]).includes(c));
  const keywords = [...new Set(rows.flatMap((r) => r.verticals))].slice(0, 10);
  let funded = 0;
  let leadership = 0;

  if (countries.length) {
    for (const f of await provider.recentlyFunded({ countries, keywords })) {
      const company = await upsertCompany({ name: f.name ?? f.domain, domain: f.domain, country: f.country });
      const id = await insertSignal({
        companyId: company.id,
        definitionKey: "funding_round",
        title: `${company.name} raised ${f.fundingType ? `a ${f.fundingType.replace(/_/g, " ")} round` : "funding"} in ${f.lastFundingYear}`,
        summary: "Detected by the weekly people & funding scan.",
        url: `leadocean:funding:${f.domain}:${f.lastFundingYear}:${f.fundingType ?? ""}`,
        source: "LeadOcean",
        language: "en",
      });
      if (id) funded++;
    }
  }

  // Leadership changes: diff each tracked account's C-suite against last week's roster.
  const tracked = await db
    .selectDistinct({ id: companies.id, name: companies.name, domain: companies.domain, enrichment: companies.enrichment })
    .from(companies)
    .innerJoin(clientAccounts, eq(clientAccounts.companyId, companies.id))
    .where(isNotNull(companies.domain));
  for (const c of tracked) {
    const execs = await provider.executives(c.domain!);
    const before = (c.enrichment?.executives as string[] | undefined) ?? null;
    await db
      .update(companies)
      .set({ enrichment: { ...(c.enrichment ?? {}), executives: execs.map((e) => e.fullName) } })
      .where(eq(companies.id, c.id));
    if (!before) continue;
    for (const e of execs.filter((x) => !before.includes(x.fullName))) {
      const id = await insertSignal({
        companyId: c.id,
        definitionKey: "leadership_change",
        title: `${c.name}: ${e.fullName} joined as ${e.title ?? "an executive"}`,
        summary: "New executive detected by the weekly people scan.",
        url: `leadocean:exec:${c.domain}:${e.fullName}`,
        source: "LeadOcean",
        language: "en",
      });
      if (id) leadership++;
    }
  }
  return { funded, leadership };
}
