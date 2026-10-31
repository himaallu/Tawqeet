/**
 * Deterministic spam/deliverability rules (English + Arabic). The simulated inbox combines
 * these with a model check.
 */
const TRIGGERS_EN = [
  "free", "guarantee", "guaranteed", "act now", "limited time", "urgent", "winner", "100%",
  "risk-free", "risk free", "no obligation", "click here", "buy now", "$$$", "cash bonus",
  "earn money", "special promotion", "exclusive deal", "dear friend", "once in a lifetime",
  "double your", "best price", "no cost", "order now", "apply now",
];
const TRIGGERS_AR = [
  "مجاني", "مجانا", "مجاناً", "عرض خاص", "اربح", "ربح مضمون", "لفترة محدودة", "عاجل",
  "اضغط هنا", "فرصة ذهبية", "خصم حصري", "مضمون 100", "اشترِ الآن", "اشتر الآن",
];

export const OPT_OUT = {
  en: "Not relevant? Reply 'stop' and I won't email again.",
  ar: "غير مهتم؟ رد بكلمة «توقف» ولن أراسلك مجدداً.",
} as const;

export function hasOptOut(body: string): boolean {
  return /reply\s+['"‘’“”]?stop['"‘’“”]?/i.test(body) || /توقف/.test(body);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function linkCount(text: string): number {
  return (text.match(/https?:\/\/\S+|www\.\S+/gi) ?? []).length;
}

/** Questions in the body, ignoring the opt-out line. */
export function askCount(body: string): number {
  const withoutOptOut = body
    .split("\n")
    .filter((l) => !hasOptOut(l))
    .join("\n");
  return (withoutOptOut.match(/[?؟]/g) ?? []).length;
}

export type SpamReport = { flags: string[]; risk: number };

export function spamRules(subject: string, body: string): SpamReport {
  const flags: string[] = [];
  const text = `${subject}\n${body}`;
  const lower = text.toLowerCase();

  for (const w of TRIGGERS_EN) {
    if (new RegExp(`(^|[^a-z])${w.replace(/[$%]/g, "\\$&")}([^a-z]|$)`, "i").test(lower)) flags.push(`Trigger phrase: "${w}"`);
  }
  for (const w of TRIGGERS_AR) if (text.includes(w)) flags.push(`Trigger phrase: "${w}"`);

  const capsWords = (text.match(/\b[A-Z]{4,}\b/g) ?? []).filter((w) => !["GITEX", "UAE", "KSA", "GCC", "CEO", "CFO", "COO", "CTO", "CHRO", "HR"].includes(w));
  if (capsWords.length >= 2 || /^[^a-z]*[A-Z]{3,}[^a-z]*$/.test(subject)) flags.push("ALL CAPS words");
  if (linkCount(body) > 1) flags.push("More than one link");
  if (/<img/i.test(body) && wordCount(body.replace(/<[^>]+>/g, "")) < 20) flags.push("Image-only body");
  if (wordCount(body) > 150) flags.push("Longer than 150 words");
  if (!hasOptOut(body)) flags.push("Missing opt-out line");
  if ((subject.match(/!/g) ?? []).length > 0) flags.push("Exclamation mark in subject");

  const weights = flags.map((f) => (f.startsWith("Trigger") ? 0.15 : f === "Missing opt-out line" ? 0.3 : 0.2));
  const risk = Math.min(1, weights.reduce((a, b) => a + b, 0));
  return { flags, risk: Math.round(risk * 100) / 100 };
}
