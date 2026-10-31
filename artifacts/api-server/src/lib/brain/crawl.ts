import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import * as cheerio from "cheerio";
import { BrainError } from "./errors";

const MAX_BYTES = 1_500_000;
const domain = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");
export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new BrainError(400, "Enter a valid public http(s) URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || (url.port && !["80", "443"].includes(url.port))) {
    throw new BrainError(400, "Only public http(s) URLs on standard ports are allowed.");
  }
  url.hash = "";
  return url;
}

function isPublic(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch { return false; }
}

/** DNS is validated AND pinned for each request/redirect to prevent DNS rebinding. */
export async function fetchPublicHtml(raw: string, allowedDomain?: string, redirects = 0): Promise<{ url: string; html: string }> {
  const url = parsePublicUrl(raw);
  if (allowedDomain && domain(url) !== allowedDomain) throw new BrainError(400, "Redirect left the website's domain.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try { addresses = await lookup(host, { all: true }); }
  catch { throw new BrainError(422, "The website hostname could not be resolved."); }
  if (!addresses.length || addresses.some(a => !isPublic(a.address))) {
    throw new BrainError(400, "Private, local, and reserved network addresses cannot be fetched.");
  }
  const address = addresses[0]!;
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(url, {
      method: "GET",
      headers: { "User-Agent": "TawqeetBrain/1.0", Accept: "text/html,application/xhtml+xml" },
      family: address.family,
      signal: AbortSignal.timeout(12_000),
      lookup: (_host, _options, cb) => cb(null, address.address, address.family),
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        response.resume();
        if (redirects >= 4) { reject(new BrainError(422, "Too many website redirects.")); return; }
        let next: URL;
        try { next = new URL(response.headers.location, url); } catch { reject(new BrainError(422, "Invalid website redirect.")); return; }
        resolve(fetchPublicHtml(next.href, allowedDomain, redirects + 1));
        return;
      }
      if ((response.statusCode || 500) >= 400) {
        response.resume(); reject(new BrainError(422, `Website returned HTTP ${response.statusCode}.`)); return;
      }
      if (!/^(text\/html|application\/xhtml\+xml)/i.test(response.headers["content-type"] || "")) {
        response.resume(); reject(new BrainError(422, "The URL must point to an HTML web page.")); return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { request.destroy(new BrainError(422, "Website page exceeds the 1.5 MB limit.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ url: url.href, html: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    request.setTimeout(8_000, () => request.destroy(new BrainError(422, "Website request timed out.")));
    request.on("error", error => reject(error instanceof BrainError ? error : new BrainError(422, "The website could not be fetched securely.")));
    request.end();
  });
}

export function readableHtml(html: string) {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,iframe,nav,footer,header").remove();
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, 16000);
}

export async function crawlWebsite(raw: string) {
  const input = parsePublicUrl(raw);
  const allowed = domain(input);
  const queue = [new URL("/", input).href, input.href];
  const visited = new Set<string>();
  const pages: { url: string; text: string }[] = [];
  const warnings: string[] = [];
  const deadline = Date.now() + 60_000;
  while (queue.length && visited.size < 11 && Date.now() < deadline) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    try {
      const page = await fetchPublicHtml(next, allowed);
      pages.push({ url: page.url, text: readableHtml(page.html) });
      const $ = cheerio.load(page.html);
      const links = $("a[href]").map((_i, el) => $(el).attr("href")).get().slice(0, 1000)
        .flatMap(href => {
          try {
            const link = new URL(href, page.url);
            link.hash = ""; link.search = "";
            if (!["http:", "https:"].includes(link.protocol) || domain(link) !== allowed
              || /\.(pdf|docx?|pptx?|xlsx?|zip|png|jpe?g|gif|mp4|svg)$/i.test(link.pathname)) return [];
            return [link.href];
          } catch { return []; }
        });
      links.sort((a, b) => Number(/about|case|customer|service|solution|product/.test(b)) - Number(/about|case|customer|service|solution|product/.test(a)));
      for (const link of links) if (!visited.has(link) && !queue.includes(link) && queue.length < 60) queue.push(link);
    } catch (error) {
      if (!pages.length) throw error;
      warnings.push(`Skipped ${new URL(next).pathname}: ${error instanceof Error ? error.message : "unavailable"}`);
    }
  }
  if (Date.now() >= deadline) warnings.push("Crawl stopped at its 60-second limit.");
  if (!pages.some(p => p.text.length > 50)) throw new BrainError(422, "No readable text was found. JavaScript-only sites may need the onboarding form instead.");
  return { pages, warnings };
}
