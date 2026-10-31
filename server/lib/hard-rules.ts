import { hasOptOut, OPT_OUT } from "./spam";

/**
 * Hard rules applied after generation:
 *   1. No claims from the client's no_go_claims.
 *   2. No numbers that aren't in the brain, an approved case study, or the signal itself.
 *   3. The opt-out line is present.
 * check() reports; enforce() fixes deterministically (drops offending sentences, adds opt-out).
 */
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const normDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));

/** Numeric tokens like 30%, 120M, 2,500, 4.5x — normalised to bare digits. */
export function numbersIn(text: string): string[] {
  const matches = normDigits(text).match(/\d[\d,.]*/g) ?? [];
  return matches.map((m) => m.replace(/[,.]+$/, "").replace(/,/g, "")).filter(Boolean);
}

// "15-minute call", "a 20 min chat", "١٥ دقيقة" — meeting lengths are not claims.
const MEETING_LENGTH = /(\d{1,2})\s*-?\s*(minute|min|mins|minutes|دقيقة|دقائق)/gi;

export function allowedNumbers(sources: string[]): Set<string> {
  const set = new Set<string>();
  for (const s of sources) for (const n of numbersIn(s)) set.add(n);
  return set;
}

export type RuleViolation = { rule: "no_go" | "invented_number" | "opt_out"; detail: string };

export function check(body: string, opts: { noGo: string[]; allowed: Set<string> }): RuleViolation[] {
  const out: RuleViolation[] = [];
  const lower = body.toLowerCase();
  for (const claim of opts.noGo) {
    if (claim.trim() && lower.includes(claim.trim().toLowerCase())) out.push({ rule: "no_go", detail: claim });
  }
  const scrubbed = normDigits(body).replace(MEETING_LENGTH, "");
  for (const n of numbersIn(scrubbed)) {
    if (!opts.allowed.has(n)) out.push({ rule: "invented_number", detail: n });
  }
  if (!hasOptOut(body)) out.push({ rule: "opt_out", detail: "missing" });
  return out;
}

const SENTENCE = /[^.!?؟\n]+[.!?؟]?/g;

export function enforce(body: string, opts: { noGo: string[]; allowed: Set<string>; language: string }): string {
  const lines = body.split("\n").map((line) => {
    if (hasOptOut(line)) return line;
    const sentences = line.match(SENTENCE) ?? [line];
    return sentences
      .filter((s) => check(s, opts).filter((v) => v.rule !== "opt_out").length === 0)
      .join("")
      .trim();
  });
  let out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!hasOptOut(out)) out += `\n\n${opts.language === "ar" ? OPT_OUT.ar : OPT_OUT.en}`;
  return out;
}
