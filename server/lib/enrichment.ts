import { eq } from "drizzle-orm";
import { db } from "../db";
import { enrichmentCache } from "../db/schema";
import { isFreeMail } from "./compliance";

/**
 * Enrichment adapter. Swap the provider by implementing EnrichmentProvider.
 * LeadOcean (https://api.leadocean.io, header x-api-key), read from its openapi.json:
 *   GET  /v1/companies/enrich?domain=           → { data: { company_data, company_metrics, ... } }
 *   POST /v1/people/search { domain[], companyName[], hqCountry[], title[], emailStatus[], count, limit }
 *        → { data: Person[], meta: { total } }   (search rows carry no contact points)
 *   GET  /v1/people/enrich?person_id=&reveal_email=true → contact_data.contact_emails[{email,type,status}]
 * Only verified / catch_all_valid work emails are kept. Results are cached 30 days per key.
 */
export type CompanyInfo = {
  name: string | null;
  domain: string;
  sizeBand: string | null;
  industry: string | null;
  country: string | null;
  technologies: string[];
};
export type FoundPerson = {
  fullName: string;
  title: string | null;
  email: string;
  emailStatus: string;
  linkedinUrl: string | null;
};
export type FindPeopleInput = { domain?: string | null; company: string; country?: string | null; titles: string[] };

export type FundedCompany = CompanyInfo & { fundingType: string | null; lastFundingYear: number | null };
export type Executive = { fullName: string; title: string | null };

export interface EnrichmentProvider {
  name: string;
  enrichCompany(domain: string): Promise<CompanyInfo | null>;
  findPeople(input: FindPeopleInput): Promise<FoundPerson[]>;
  /** Companies HQ'd in these countries that raised funding this year (radar-people). */
  recentlyFunded(input: { countries: string[]; keywords: string[] }): Promise<FundedCompany[]>;
  /** Current C-suite at a company, to diff week over week for leadership changes. */
  executives(domain: string): Promise<Executive[]>;
}

export const GOOD_EMAIL_STATUSES = ["verified", "catch_all_valid"];
const CACHE_DAYS = 30;
const BASE = "https://api.leadocean.io";

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const [hit] = await db.select().from(enrichmentCache).where(eq(enrichmentCache.key, key));
  if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_DAYS * 86_400_000) return hit.payload as T;
  const value = await fn();
  await db
    .insert(enrichmentCache)
    .values({ key, payload: value as object, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: enrichmentCache.key, set: { payload: value as object, fetchedAt: new Date() } });
  return value;
}

type Obj = Record<string, unknown>;
const pick = (o: Obj | undefined, keys: string[]): string | null => {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

export class LeadOcean implements EnrichmentProvider {
  name = "leadocean";
  constructor(
    private apiKey: string,
    private fetcher: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetcher(`${BASE}${path}`, {
        ...init,
        headers: { "x-api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      });
      if (res.status === 429 && attempt < 4) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(30, retryAfter) * 1000));
        continue;
      }
      if (res.status === 404) return { success: false, data: null } as T;
      if (!res.ok) throw new Error(`LeadOcean ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as T;
    }
  }

  async enrichCompany(domain: string): Promise<CompanyInfo | null> {
    return cached(`company:${domain}`, async () => {
      const json = await this.call<{ data: { company_data?: Obj; company_metrics?: Obj; company_detected_technologies?: Obj } | null }>(
        `/v1/companies/enrich?domain=${encodeURIComponent(domain)}`,
      );
      const d = json.data?.company_data;
      if (!d) return null;
      const techs = json.data?.company_detected_technologies;
      return {
        name: pick(d, ["company_name", "name"]),
        domain: pick(d, ["company_domain", "domain"]) ?? domain,
        sizeBand: pick(d, ["company_employee_range", "employee_range", "company_size"]),
        industry: pick(d, ["company_industry", "industry"]),
        country: pick(d, ["company_hq_country", "hq_country", "company_country", "country"]),
        technologies: Array.isArray(techs?.technologies) ? (techs!.technologies as unknown[]).map(String).slice(0, 20) : [],
      };
    });
  }

  async findPeople(input: FindPeopleInput): Promise<FoundPerson[]> {
    const key = `people:${input.domain ?? `${input.company}|${input.country ?? ""}`}:${[...input.titles].sort().join("|").toLowerCase()}`;
    return cached(key, async () => {
      const filter: Obj = {
        title: input.titles,
        emailStatus: GOOD_EMAIL_STATUSES,
        hasEmail: true,
      };
      if (input.domain) filter.domain = [input.domain];
      else {
        filter.companyName = [`[${input.company}]`];
        if (input.country) filter.hqCountry = [input.country];
      }
      // Count first so we don't pay for empty pulls.
      const head = await this.call<{ meta?: { total?: number | null; count?: number } }>("/v1/people/search", {
        method: "POST",
        body: JSON.stringify({ ...filter, count: true, limit: 1 }),
      });
      if (!(head.meta?.total ?? head.meta?.count ?? 0)) return [];

      const page = await this.call<{ data: { profile_data?: Obj; meta?: Obj; contact_data?: Obj }[] }>("/v1/people/search", {
        method: "POST",
        body: JSON.stringify({ ...filter, limit: 5 }),
      });
      const people: FoundPerson[] = [];
      for (const row of page.data.slice(0, 3)) {
        const personId = pick(row.meta?.source_ids as Obj | undefined, ["person_id"]);
        if (!personId) continue;
        const full = await this.call<{ data: { profile_data?: Obj; contact_data?: { contact_emails?: { email?: string; type?: string; status?: string }[] } } | null }>(
          `/v1/people/enrich?person_id=${encodeURIComponent(personId)}&reveal_email=true`,
        );
        const p = full.data?.profile_data ?? row.profile_data;
        const best = full.data?.contact_data?.contact_emails?.find(
          (e) => e.email && GOOD_EMAIL_STATUSES.includes(e.status ?? "") && (e.type === "work" || e.type === "other") && !isFreeMail(e.email),
        );
        if (!best?.email) continue;
        people.push({
          fullName: pick(p, ["profile_full_name", "full_name", "name"]) ?? best.email.split("@")[0],
          title: pick(p, ["profile_job_title", "profile_headline", "job_title", "title"]),
          email: best.email.toLowerCase(),
          emailStatus: best.status!,
          linkedinUrl: pick(p, ["profile_linkedin_url", "linkedin_url"]),
        });
      }
      return people;
    });
  }

  async recentlyFunded(input: { countries: string[]; keywords: string[] }): Promise<FundedCompany[]> {
    const year = new Date().getUTCFullYear();
    const json = await this.call<{ data: { company_data?: Obj }[] }>("/v1/companies/search", {
      method: "POST",
      body: JSON.stringify({
        hqCountry: input.countries,
        keywords: input.keywords.length ? input.keywords : undefined,
        minLastFundingYear: year,
        limit: 50,
      }),
    });
    return (json.data ?? []).flatMap((row) => {
      const d = row.company_data;
      const domain = pick(d, ["company_domain", "domain"]);
      if (!domain) return [];
      return [
        {
          name: pick(d, ["company_name", "name"]),
          domain,
          sizeBand: pick(d, ["company_employee_range", "employee_range"]),
          industry: pick(d, ["company_industry", "industry"]),
          country: pick(d, ["company_hq_country", "hq_country"]),
          technologies: [],
          fundingType: pick(d, ["company_last_funding_type", "last_funding_type", "funding_type"]),
          lastFundingYear: Number(pick(d, ["company_last_funding_year", "last_funding_year"])) || year,
        },
      ];
    });
  }

  async executives(domain: string): Promise<Executive[]> {
    const json = await this.call<{ data: { profile_data?: Obj }[] }>("/v1/people/search", {
      method: "POST",
      body: JSON.stringify({ domain: [domain], seniority: ["c_suite", "owner", "founder"], limit: 25 }),
    });
    return (json.data ?? []).flatMap((row) => {
      const fullName = pick(row.profile_data, ["profile_full_name", "full_name", "name"]);
      return fullName ? [{ fullName, title: pick(row.profile_data, ["profile_job_title", "profile_headline", "job_title"]) }] : [];
    });
  }
}

/** Deterministic stand-in for offline demos and tests. Marks contacts as "demo". */
export class OfflineEnrichment implements EnrichmentProvider {
  name = "offline";
  async enrichCompany(domain: string): Promise<CompanyInfo | null> {
    return { name: null, domain, sizeBand: "201-500", industry: null, country: null, technologies: [] };
  }
  async findPeople(input: FindPeopleInput): Promise<FoundPerson[]> {
    const domain = input.domain ?? `${input.company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`;
    const title = input.titles[0] ?? "Head of Operations";
    const names = ["Layla Hassan", "Omar Khalil", "Sara Al Mansoori", "Yousef Rahman", "Huda Nasser", "Karim Aziz"];
    const name = names[[...domain].reduce((a, c) => a + c.charCodeAt(0), 0) % names.length];
    const local = name.split(" ")[0].toLowerCase();
    return [{ fullName: name, title, email: `${local}@${domain}`, emailStatus: "demo", linkedinUrl: null }];
  }
  async recentlyFunded(): Promise<FundedCompany[]> {
    return [];
  }
  async executives(): Promise<Executive[]> {
    return [];
  }
}

let override: EnrichmentProvider | null = null;
export function setEnrichmentProvider(p: EnrichmentProvider | null) {
  override = p;
}

export function enrichment(): EnrichmentProvider | null {
  if (override) return override;
  if (process.env.LEADOCEAN_API_KEY) return new LeadOcean(process.env.LEADOCEAN_API_KEY);
  return process.env.NODE_ENV === "production" ? null : new OfflineEnrichment();
}
