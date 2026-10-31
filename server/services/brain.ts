import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { brainEntries, caseStudies, clients, type Icp } from "../db/schema";
import { aiObject } from "../lib/ai";
import { scrape } from "../lib/scrape";

/**
 * The Brain: what Tawqeet knows about a client. Three inputs (website crawl, onboarding form,
 * CRM import) plus learnings written every time a send gets a reply class.
 */

const MAX_PAGES = 10;

const caseStudySchema = z.object({
  customer_name: z.string(),
  customer_vertical: z.string().nullable(),
  customer_country: z.string().nullable(),
  customer_size_band: z.string().nullable(),
  problem: z.string().nullable(),
  solution: z.string().nullable(),
  result_metric: z.string().nullable(),
  result_value: z.string().nullable(),
  timeframe: z.string().nullable(),
  quote: z.string().nullable(),
  quote_person_title: z.string().nullable(),
  can_name_customer: z.boolean(),
  language: z.enum(["en", "ar"]),
});
export type ExtractedCaseStudy = z.infer<typeof caseStudySchema>;

const websiteSchema = z.object({
  offer: z.string(),
  icp: z.object({
    titles: z.array(z.string()),
    industries: z.array(z.string()),
    company_sizes: z.array(z.string()),
    pains: z.array(z.string()),
  }),
  proof_points: z.array(z.string()),
  case_studies: z.array(caseStudySchema),
  tone: z.string(),
  differentiators: z.array(z.string()),
  no_go_claims: z.array(z.string()),
});

const sentencesWithNumbers = (text: string) =>
  (text.match(/[^.!?]{20,200}\d[^.!?]{0,120}[.!?]/g) ?? []).map((s) => s.trim()).slice(0, 5);

/** Same-domain pages worth reading first: about, services, customers, case studies. */
export function pickPages(home: string, links: string[]): string[] {
  const score = (u: string) => (/(about|service|solution|product|customer|case|stor|work|industr|why|pricing)/i.test(u) ? 0 : 1);
  return [...new Set(links)]
    .filter((l) => l !== home && !/\.(pdf|jpg|jpeg|png|gif|zip|svg)$/i.test(l) && !/(login|signin|cart|privacy|terms|cookie)/i.test(l))
    .sort((a, b) => score(a) - score(b) || a.length - b.length)
    .slice(0, MAX_PAGES);
}

export async function crawlWebsite(agencyId: string, clientId: string, url: string) {
  const home = await scrape(url);
  const pages = [home];
  for (const link of pickPages(home.url, home.links)) {
    try {
      pages.push(await scrape(link));
    } catch {
      // skip pages we can't read (robots, JS without Firecrawl, errors)
    }
  }
  const corpus = pages.map((p) => `# ${p.title} (${p.url})\n${p.text.slice(0, 6000)}`).join("\n\n").slice(0, 60_000);

  const extracted = await aiObject({
    agencyId,
    clientId,
    purpose: "brain.website",
    schema: websiteSchema,
    system:
      "You build a B2B sales knowledge profile from a company's website. Only state what the pages support. " +
      "Case studies: only real customer stories present on the pages; can_name_customer is true only if the customer is named publicly. " +
      "no_go_claims: claims the company clearly avoids or that would be risky (e.g. guarantees, regulated claims).",
    prompt: `Website pages:\n\n${corpus}`,
    offline: () => ({
      offer: `${home.title}. ${home.text.slice(0, 220)}`.trim(),
      icp: { titles: [], industries: [], company_sizes: [], pains: [] },
      proof_points: sentencesWithNumbers(corpus),
      case_studies: [],
      tone: "Professional, concise",
      differentiators: [],
      no_go_claims: [],
    }),
  });

  await db.insert(brainEntries).values({
    agencyId,
    clientId,
    kind: "website",
    content: extracted.offer,
    meta: { url, pages: pages.map((p) => p.url), extracted },
  });
  await mergeIntoClient(agencyId, clientId, {
    offer: extracted.offer,
    tone: extracted.tone,
    proofPoints: extracted.proof_points,
    differentiators: extracted.differentiators,
    noGoClaims: extracted.no_go_claims,
    icp: extracted.icp,
  });
  for (const cs of extracted.case_studies) await saveCaseStudy(agencyId, clientId, cs, "website", url);
  return { pages: pages.length, extracted };
}

type Merge = {
  offer?: string;
  tone?: string;
  proofPoints?: string[];
  differentiators?: string[];
  noGoClaims?: string[];
  languages?: string[];
  icp?: Partial<Icp>;
};

const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b].map((s) => s.trim()).filter(Boolean))];

/** Fills blanks and unions lists; never overwrites what a human typed. */
export async function mergeIntoClient(agencyId: string, clientId: string, m: Merge) {
  const [c] = await db.select().from(clients).where(and(eq(clients.agencyId, agencyId), eq(clients.id, clientId)));
  if (!c) throw new Error("Client not found");
  const icp: Icp = { ...c.icp };
  for (const k of ["titles", "industries", "company_sizes", "pains", "seniorities"] as const) {
    if (m.icp?.[k]) icp[k] = union(c.icp[k], m.icp[k]);
  }
  if (m.icp?.deal_size && !icp.deal_size) icp.deal_size = m.icp.deal_size;
  if (m.icp?.notes) icp.notes = m.icp.notes; // only the onboarding form sets notes
  await db
    .update(clients)
    .set({
      offer: c.offer || m.offer || null,
      tone: c.tone || m.tone || null,
      proofPoints: union(c.proofPoints, m.proofPoints),
      differentiators: union(c.differentiators, m.differentiators),
      noGoClaims: union(c.noGoClaims, m.noGoClaims),
      languages: union(c.languages, m.languages),
      icp,
    })
    .where(and(eq(clients.agencyId, agencyId), eq(clients.id, clientId)));
}

export const onboardingSchema = z.object({
  sellTo: z.string().trim().min(1).max(2000),
  targetTitles: z.array(z.string().trim().min(1)).max(20).default([]),
  dealSize: z.string().trim().max(200).default(""),
  pains: z.array(z.string().trim().min(1)).max(3).default([]),
  proof: z.string().trim().max(4000).default(""),
  neverSay: z.array(z.string().trim().min(1)).max(50).default([]),
  languages: z.array(z.enum(["en", "ar"])).min(1).default(["en"]),
});

export async function saveOnboardingForm(agencyId: string, clientId: string, form: z.infer<typeof onboardingSchema>) {
  await db.insert(brainEntries).values({ agencyId, clientId, kind: "form", content: form.sellTo, meta: form });
  await mergeIntoClient(agencyId, clientId, {
    noGoClaims: form.neverSay,
    languages: form.languages,
    proofPoints: form.proof ? form.proof.split("\n").map((s) => s.trim()) : [],
    icp: { titles: form.targetTitles, pains: form.pains, deal_size: form.dealSize || undefined, notes: form.sellTo },
  });
}

// ---------- case studies ----------

export async function extractCaseStudies(agencyId: string, clientId: string, text: string): Promise<ExtractedCaseStudy[]> {
  const result = await aiObject({
    agencyId,
    clientId,
    purpose: "brain.case_study",
    schema: z.object({ case_studies: z.array(caseStudySchema) }),
    system:
      "Extract customer case studies from the document. Use only facts in the text; leave fields null when absent. " +
      "can_name_customer is true only if the document says the customer may be named or names them publicly.",
    prompt: text.slice(0, 50_000),
    offline: () => {
      const first = text.split("\n").find((l) => l.trim().length > 3)?.trim().slice(0, 80) ?? "Customer";
      const metric = sentencesWithNumbers(text)[0] ?? null;
      return {
        case_studies: [
          {
            customer_name: first,
            customer_vertical: null,
            customer_country: null,
            customer_size_band: null,
            problem: null,
            solution: null,
            result_metric: metric,
            result_value: metric?.match(/\d[\d,.]*\s*%?/)?.[0] ?? null,
            timeframe: null,
            quote: null,
            quote_person_title: null,
            can_name_customer: false,
            language: /[؀-ۿ]/.test(text) ? ("ar" as const) : ("en" as const),
          },
        ],
      };
    },
  });
  return result.case_studies;
}

export async function saveCaseStudy(
  agencyId: string,
  clientId: string,
  cs: ExtractedCaseStudy,
  source: "upload" | "url" | "form" | "website",
  sourceRef: string | null,
) {
  const [row] = await db
    .insert(caseStudies)
    .values({
      agencyId,
      clientId,
      customerName: cs.customer_name,
      customerVertical: cs.customer_vertical,
      customerCountry: cs.customer_country,
      customerSizeBand: cs.customer_size_band,
      problem: cs.problem,
      solution: cs.solution,
      resultMetric: cs.result_metric,
      resultValue: cs.result_value,
      timeframe: cs.timeframe,
      quote: cs.quote,
      quotePersonTitle: cs.quote_person_title,
      canNameCustomer: cs.can_name_customer,
      language: cs.language,
      source,
      sourceRef,
      approved: false, // a human must approve before the writer may use it
    })
    .returning();
  return row;
}

// ---------- learnings ----------

export type Learning = {
  signal_key: string | null;
  play_id: string | null;
  persona: string | null;
  vertical: string | null;
  language: string;
  subject: string;
  score: number | null;
  reply_class: string;
};

export async function recordLearning(agencyId: string, clientId: string, l: Learning) {
  const content = `${l.reply_class} reply · ${l.signal_key ?? "signal"} · ${l.persona ?? "persona"} · "${l.subject}" (score ${l.score ?? "–"})`;
  await db.insert(brainEntries).values({ agencyId, clientId, kind: "learning", content, meta: l });
}

/** Last 50 learnings for the client, same vertical first. */
export async function recentLearnings(agencyId: string, clientId: string, vertical: string | null): Promise<Learning[]> {
  const rows = await db
    .select()
    .from(brainEntries)
    .where(and(eq(brainEntries.agencyId, agencyId), eq(brainEntries.clientId, clientId), eq(brainEntries.kind, "learning")))
    .orderBy(desc(brainEntries.createdAt))
    .limit(200);
  const all = rows.map((r) => r.meta as unknown as Learning);
  const same = all.filter((l) => vertical && l.vertical === vertical);
  const rest = all.filter((l) => !(vertical && l.vertical === vertical));
  return [...same, ...rest].slice(0, 50);
}
