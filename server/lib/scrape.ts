import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";

/**
 * Fetch a page as text: plain fetch + cheerio first, hosted scraper (Firecrawl) only when the
 * page needs JavaScript. robots.txt is checked before either.
 */
const USER_AGENT = "TawqeetBot/1.0 (+https://tawqeet.app/bot)";
const MIN_TEXT_LENGTH = 400; // below this we assume the page renders client-side
const TIMEOUT_MS = 15_000;

export type ScrapeResult = {
  url: string;
  title: string;
  text: string;
  links: string[]; // absolute same-origin links
  via: "fetch" | "firecrawl";
};

let fetcher: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
export function setScrapeFetcher(f: typeof fetch) {
  fetcher = f;
}

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

export async function allowedByRobots(url: string): Promise<boolean> {
  const origin = new URL(url).origin;
  let robots = robotsCache.get(origin);
  if (!robots) {
    const robotsUrl = `${origin}/robots.txt`;
    let body = "";
    try {
      const res = await fetcher(robotsUrl, { headers: { "user-agent": USER_AGENT } });
      if (res.ok) body = await res.text();
    } catch {
      // Unreachable robots.txt is treated as "no rules".
    }
    robots = robotsParser(robotsUrl, body);
    robotsCache.set(origin, robots);
  }
  return robots.isAllowed(url, USER_AGENT) !== false;
}

export function extract(html: string, url: string): Omit<ScrapeResult, "via"> {
  const $ = cheerio.load(html);
  const origin = new URL(url).origin;
  const links = new Set<string>();
  $("a[href]").each((_, a) => {
    try {
      const href = new URL($(a).attr("href")!, url);
      href.hash = "";
      if (href.origin === origin && /^https?:$/.test(href.protocol)) links.add(href.toString());
    } catch {
      // ignore malformed hrefs
    }
  });
  $("script, style, noscript, svg, iframe").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { url, title: $("title").first().text().trim(), text, links: [...links] };
}

export async function scrape(url: string): Promise<ScrapeResult> {
  if (!(await allowedByRobots(url))) throw new Error(`robots.txt disallows ${url}`);
  const res = await fetcher(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" } });
  if (res.ok) {
    const page = extract(await res.text(), url);
    if (page.text.length >= MIN_TEXT_LENGTH) return { ...page, via: "fetch" };
  }
  return firecrawl(url);
}

/** Raw fetch for feeds (RSS/XML). Respects robots.txt. */
export async function fetchRaw(url: string): Promise<string> {
  if (!(await allowedByRobots(url))) throw new Error(`robots.txt disallows ${url}`);
  const res = await fetcher(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

async function firecrawl(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error(`Page needs JavaScript and FIRECRAWL_API_KEY is not set: ${url}`);
  const res = await fetcher("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: true }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status} for ${url}`);
  const json = (await res.json()) as { data?: { markdown?: string; links?: string[]; metadata?: { title?: string } } };
  const origin = new URL(url).origin;
  return {
    url,
    title: json.data?.metadata?.title ?? "",
    text: json.data?.markdown ?? "",
    links: (json.data?.links ?? []).filter((l) => l.startsWith(origin)),
    via: "firecrawl",
  };
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
