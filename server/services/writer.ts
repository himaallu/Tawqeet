import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Angle } from "../../shared/enums";
import { db } from "../db";
import { caseStudies, clients, companies, drafts, leads, leadSignals, plays, signalDefinitions, signals } from "../db/schema";
import { aiObject } from "../lib/ai";
import { allowedNumbers, check, enforce, type RuleViolation } from "../lib/hard-rules";
import { enqueue, Q } from "../lib/jobs";
import { OPT_OUT } from "../lib/spam";
import { recentLearnings } from "./brain";

/**
 * generateDrafts(lead): 3 variants with different angles (outcome-led, signal-led, proof-led),
 * then the hard rules: no no-go claims, no numbers that aren't in the brain / an approved case
 * study / the signal, and the opt-out line.
 */

type Lead = typeof leads.$inferSelect;
type Client = typeof clients.$inferSelect;
type Company = typeof companies.$inferSelect;
type CaseStudy = typeof caseStudies.$inferSelect;
type Play = typeof plays.$inferSelect;
type SignalRow = { id: string; key: string; name: string; title: string; summary: string | null; url: string | null; detectedAt: Date };

export function personaOf(title: string | null): string {
  const t = (title ?? "").toLowerCase();
  if (/\b(ceo|founder|managing director|md|president|chairman|owner|general manager)\b|الرئيس التنفيذي|المدير العام/.test(t)) return "c_level";
  if (/\b(hr|people|talent|human resources|chro)\b|الموارد البشرية/.test(t)) return "hr";
  if (/\b(cfo|finance|financial|controller|treasury)\b|المالية/.test(t)) return "finance";
  if (/\b(coo|operations|supply chain|logistics|procurement)\b|العمليات|المشتريات/.test(t)) return "operations";
  if (/\b(sales|revenue|commercial|business development|cro)\b|المبيعات/.test(t)) return "sales";
  if (/\b(cto|cio|it|technology|engineering|digital)\b|التقنية/.test(t)) return "it";
  if (/\b(cmo|marketing|brand|growth)\b|التسويق/.test(t)) return "marketing";
  return "any";
}

/** Best play: signal_key → persona → vertical → language. */
export function pickPlay(all: Play[], signalKey: string, persona: string, vertical: string | null, language: string): Play | null {
  const v = (vertical ?? "").toLowerCase();
  const scored = all
    .filter((p) => p.signalKey === signalKey)
    .map((p) => ({
      p,
      s:
        (p.persona === persona ? 4 : p.persona === "any" ? 1 : -10) +
        (v && p.vertical.toLowerCase() === v ? 2 : p.vertical === "any" ? 0.5 : -10) +
        (p.language === language ? 3 : -5),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored[0]?.p ?? null;
}

const SIZE_ORDER = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"];

/** 1–2 approved case studies closest to the lead: vertical, then country, then size/problem. */
export function matchCaseStudies(all: CaseStudy[], company: Company, signalText: string): CaseStudy[] {
  const v = (company.vertical ?? "").toLowerCase();
  const words = new Set(signalText.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  return all
    .filter((c) => c.approved)
    .map((c) => {
      let s = 0;
      const cv = (c.customerVertical ?? "").toLowerCase();
      if (v && cv && (cv.includes(v) || v.includes(cv))) s += 8;
      if (company.country && c.customerCountry && c.customerCountry.toUpperCase().includes(company.country)) s += 4;
      const a = SIZE_ORDER.indexOf(company.sizeBand ?? "");
      const b = SIZE_ORDER.indexOf(c.customerSizeBand ?? "");
      if (a >= 0 && b >= 0 && Math.abs(a - b) <= 1) s += 2;
      if ([...words].some((w) => (c.problem ?? "").toLowerCase().includes(w))) s += 1;
      return { c, s };
    })
    .sort((x, y) => y.s - x.s)
    .slice(0, 2)
    .map((x) => x.c);
}

const COUNTRY_CITY: Record<string, string> = { AE: "UAE", SA: "Saudi", QA: "Qatari", KW: "Kuwaiti", BH: "Bahraini", OM: "Omani" };

const COUNTRY_AR: Record<string, string> = { AE: "إماراتية", SA: "سعودية", QA: "قطرية", KW: "كويتية", BH: "بحرينية", OM: "عُمانية" };

/** "a Dubai logistics company with 200 staff" when the customer can't be named. */
export function caseStudyLabel(c: CaseStudy, language = "en"): string {
  if (c.canNameCustomer) return c.customerName;
  if (language === "ar") {
    const place = COUNTRY_AR[(c.customerCountry ?? "").toUpperCase()] ?? "خليجية";
    return `شركة ${place} مماثلة`;
  }
  const place = c.customerCountry ? (COUNTRY_CITY[c.customerCountry.toUpperCase()] ?? c.customerCountry) : "Gulf";
  const size = c.customerSizeBand ? ` with ${c.customerSizeBand.replace("-", "–")} staff` : "";
  return `a ${place} ${(c.customerVertical ?? "").toLowerCase() || "regional"} company${size}`.replace(/\s+/g, " ");
}

const variantSchema = z.object({
  variants: z
    .array(
      z.object({
        angle: z.enum(["outcome", "signal", "proof"]),
        subject: z.string(),
        body: z.string(),
        case_study_id: z.string().nullable(),
      }),
    )
    .length(3),
});

type Context = {
  lead: Lead;
  client: Client;
  company: Company;
  sigs: SignalRow[];
  play: Play | null;
  matched: CaseStudy[];
  language: string;
};

const firstName = (n: string | null) => (n ?? "").trim().split(/\s+/)[0] || "there";

/** Deterministic templates for offline mode. */
export function offlineVariants(ctx: Context): z.infer<typeof variantSchema> {
  const { lead, client, company, sigs, matched } = ctx;
  const ar = ctx.language === "ar";
  const isAr = (t: string | null | undefined) => /[\u0600-\u06FF]/.test(t ?? "");
  // Offline templates can't translate, so Arabic drafts only use Arabic-language material.
  const top = ar ? (sigs.find((s) => isAr(s.title)) ?? sigs[0]) : sigs[0];
  const cs = ar ? matched.find((c) => c.language === "ar") : matched[0];
  const proofNumber = (ar ? client.proofPoints.filter(isAr) : client.proofPoints.filter((p) => !isAr(p))).find((p) => /\d|[٠-٩]/.test(p));
  const offer = ar
    ? (isAr(client.offer) ? client.offer! : `يعمل فريق ${client.name} مع شركات خليجية في مجال ${client.verticals[0] ?? "أعمالكم"}`).split(/[.!\n]/)[0].trim()
    : (client.offer ?? client.name).split(/[.!\n]/)[0].trim();
  const csLine = cs
    ? ar
      ? `ساعدنا ${caseStudyLabel(cs, "ar")}${cs.resultMetric && isAr(cs.resultMetric) ? `، حيث ${cs.resultMetric.replace(/\.$/, "")}` : " على تحقيق نتائج مماثلة"}.`
      : `We helped ${caseStudyLabel(cs)} ${cs.resultMetric ? `achieve ${cs.resultMetric.replace(/\.$/, "")}` : "get there faster"}.`
    : "";
  const sign = ar ? `مع التحية،\nفريق ${client.name}` : `Best,\n${client.name}`;
  const opt = ar ? OPT_OUT.ar : OPT_OUT.en;
  const obs = top
    ? ar
      ? isAr(top.title)
        ? `لاحظت خبر: ${top.title.replace(/\.$/, "")}.`
        : `لاحظت التطورات الأخيرة في ${company.name}.`
      : `Saw the news: ${top.title.replace(/\.$/, "")}.`
    : "";
  const ask = ar ? "هل يناسبك اتصال لمدة ١٥ دقيقة يوم الثلاثاء أو الأربعاء؟" : "Would a 15-minute call Tuesday or Wednesday be useful?";
  const hi = ar ? `مرحباً ${firstName(lead.fullName)}،` : `Hi ${firstName(lead.fullName)},`;
  const body = (...parts: string[]) => [hi, ...parts.filter(Boolean), ask, sign, opt].join("\n\n");
  return {
    variants: [
      {
        angle: "outcome",
        subject: ar ? `${company.name}: فكرة سريعة` : `${company.name} — a quick idea`,
        body: body(obs, `${offer}.${proofNumber ? ` ${proofNumber.replace(/\.$/, "")}.` : ""}`),
        case_study_id: null,
      },
      {
        angle: "signal",
        subject: top ? (ar ? `بخصوص ${top.name}` : `Re: ${top.name.toLowerCase()} at ${company.name}`) : company.name,
        body: body(obs, ar ? (isAr(lead.whyNow) ? lead.whyNow! : "") : (lead.whyNow ?? ""), ar ? `وهنا تحديداً يساعد فريق ${client.name}.` : `That's exactly where ${client.name} helps.`),
        case_study_id: null,
      },
      {
        angle: "proof",
        subject: ar ? `كيف فعلتها شركة مماثلة` : `How a similar team did it`,
        body: body(obs, csLine || (ar ? `${offer}.` : `${offer}.`)),
        case_study_id: cs?.id ?? null,
      },
    ],
  };
}

function writerPrompt(ctx: Context, learnings: unknown[]) {
  const { lead, client, company, sigs, play, matched } = ctx;
  return JSON.stringify(
    {
      language: ctx.language,
      sender: { company: client.name, offer: client.offer, tone: client.tone, proof_points: client.proofPoints, differentiators: client.differentiators, no_go_claims: client.noGoClaims },
      lead: { name: lead.fullName, title: lead.title, why_now: lead.whyNow },
      company: { name: company.name, country: company.country, vertical: company.vertical, size: company.sizeBand },
      signals: sigs.map((s) => ({ type: s.name, title: s.title, summary: s.summary, date: s.detectedAt.toISOString().slice(0, 10) })),
      play: play && { name: play.name, structure: play.structure, principles: play.principles },
      case_studies: matched.map((c) => ({
        id: c.id,
        refer_to_customer_as: caseStudyLabel(c, ctx.language),
        problem: c.problem,
        solution: c.solution,
        result: [c.resultMetric, c.resultValue].filter(Boolean).join(" — "),
        timeframe: c.timeframe,
        quote: c.canNameCustomer ? c.quote : null,
      })),
      recent_learnings: learnings,
      opt_out_line: ctx.language === "ar" ? OPT_OUT.ar : OPT_OUT.en,
    },
    null,
    1,
  );
}

const WRITER_SYSTEM = `You write cold B2B emails for a Gulf outbound agency, on behalf of the sender.
Write exactly 3 variants with different angles: "outcome" (lead with one believable outcome), "signal" (lead with the signal), "proof" (lead with the matched case study; set case_study_id to its id).
Rules:
- Follow the play structure and principles.
- First line: a specific, true observation tied to the signal. No flattery.
- Any number or result must come from the sender's proof points or a case study provided. Otherwise write without numbers.
- Never use anything in no_go_claims. Refer to case-study customers exactly as "refer_to_customer_as".
- Under 120 words. Plain text. At most one link. One small, specific ask.
- End with the opt_out_line verbatim.
- If language is "ar", write natively in Modern Standard Arabic with a respectful GCC business tone — do not translate from English.
- Learn from recent_learnings: favour what got positive replies.`;

async function loadContext(agencyId: string, leadId: string): Promise<Context | null> {
  const [row] = await db
    .select({ lead: leads, client: clients, company: companies })
    .from(leads)
    .innerJoin(clients, eq(clients.id, leads.clientId))
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(leads.agencyId, agencyId), eq(leads.id, leadId)));
  if (!row) return null;
  const sigs = await db
    .select({ id: signals.id, key: signals.definitionKey, name: signalDefinitions.name, title: signals.title, summary: signals.summary, url: signals.url, detectedAt: signals.detectedAt })
    .from(leadSignals)
    .innerJoin(signals, eq(signals.id, leadSignals.signalId))
    .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
    .where(eq(leadSignals.leadId, leadId))
    .orderBy(desc(signals.detectedAt))
    .limit(5);
  const language = row.lead.language === "ar" ? "ar" : "en";
  const agencyPlays = await db.select().from(plays).where(eq(plays.agencyId, agencyId));
  const play = sigs[0] ? pickPlay(agencyPlays, sigs[0].key, personaOf(row.lead.title), row.company.vertical, language) : null;
  const studies = await db.select().from(caseStudies).where(and(eq(caseStudies.agencyId, agencyId), eq(caseStudies.clientId, row.client.id)));
  const matched = matchCaseStudies(studies, row.company, sigs.map((s) => `${s.title} ${s.summary ?? ""}`).join(" "));
  return { ...row, sigs, play, matched, language };
}

function sourcesFor(ctx: Context): string[] {
  return [
    ctx.client.offer ?? "",
    ...ctx.client.proofPoints,
    ...ctx.client.differentiators,
    ...ctx.matched.flatMap((c) => [c.resultMetric ?? "", c.resultValue ?? "", c.timeframe ?? "", c.customerSizeBand ?? "", c.problem ?? "", c.solution ?? ""]),
    ...ctx.sigs.flatMap((s) => [s.title, s.summary ?? ""]),
    ctx.company.name,
    ctx.lead.whyNow ?? "",
  ];
}

const describe = (v: RuleViolation) =>
  v.rule === "no_go" ? `Removed no-go claim "${v.detail}"` : v.rule === "invented_number" ? `Removed unsupported number ${v.detail}` : "Added opt-out line";

/** Applies the hard rules: one AI repair attempt, then deterministic enforcement. */
export async function applyHardRules(ctx: Context, v: { subject: string; body: string }) {
  const opts = { noGo: ctx.client.noGoClaims, allowed: allowedNumbers(sourcesFor(ctx)) };
  let body = v.body;
  let violations = check(body, opts);
  const notes: string[] = [];
  if (violations.some((x) => x.rule !== "opt_out")) {
    const fixed = await aiObject({
      agencyId: ctx.client.agencyId,
      clientId: ctx.client.id,
      purpose: "writer.repair",
      schema: z.object({ body: z.string() }),
      system: "Rewrite the email to remove the listed problems. Keep everything else. Do not add new numbers or claims.",
      prompt: `Problems:\n${violations.map((x) => `- ${x.rule}: ${x.detail}`).join("\n")}\n\nEmail:\n${body}`,
      offline: () => ({ body }),
    });
    body = fixed.body;
  }
  violations = check(body, opts);
  if (violations.length) {
    notes.push(...violations.map(describe));
    body = enforce(body, { ...opts, language: ctx.language });
  }
  for (const c of ctx.matched) {
    if (!c.canNameCustomer && body.includes(c.customerName)) {
      body = body.split(c.customerName).join(caseStudyLabel(c, ctx.language));
      notes.push(`Anonymised ${caseStudyLabel(c, ctx.language)}`);
    }
  }
  const subject = ctx.client.noGoClaims.reduce((s, claim) => (claim && s.toLowerCase().includes(claim.toLowerCase()) ? ctx.company.name : s), v.subject);
  return { subject: subject.trim(), body: body.trim(), notes };
}

export async function generateDrafts(agencyId: string, leadId: string, opts: { queueSimulation?: boolean } = {}) {
  const ctx = await loadContext(agencyId, leadId);
  if (!ctx) return { created: 0 };
  const learnings = await recentLearnings(agencyId, ctx.client.id, ctx.company.vertical);

  const out = await aiObject({
    agencyId,
    clientId: ctx.client.id,
    purpose: "writer.generate",
    schema: variantSchema,
    system: WRITER_SYSTEM,
    prompt: writerPrompt(ctx, learnings),
    offline: () => offlineVariants(ctx),
  });

  await db.delete(drafts).where(and(eq(drafts.leadId, leadId), eq(drafts.status, "generated")));
  const angles: Angle[] = ["outcome", "signal", "proof"];
  const ordered = angles.map((a, i) => out.variants.find((v) => v.angle === a) ?? out.variants[i]);
  const validCs = new Set(ctx.matched.map((c) => c.id));
  for (const [i, v] of ordered.entries()) {
    const ruled = await applyHardRules(ctx, v);
    await db.insert(drafts).values({
      agencyId,
      clientId: ctx.client.id,
      leadId,
      variant: i + 1,
      playId: ctx.play?.id ?? null,
      angle: v.angle,
      caseStudyId: v.case_study_id && validCs.has(v.case_study_id) ? v.case_study_id : null,
      subject: ruled.subject,
      body: ruled.body,
      language: ctx.language,
      violations: ruled.notes,
    });
  }
  await db.update(leads).set({ status: "drafted" }).where(eq(leads.id, leadId));
  if (opts.queueSimulation !== false) await enqueue(Q.simulate, { agencyId, leadId });
  return { created: 3 };
}

/** Auto-rewrite of a low-scoring winner using the personas' notes. */
export async function rewriteWithNotes(agencyId: string, draftId: string, notes: string[]) {
  const [d] = await db.select().from(drafts).where(and(eq(drafts.agencyId, agencyId), eq(drafts.id, draftId)));
  if (!d) return null;
  const ctx = (await loadContext(agencyId, d.leadId))!;
  const out = await aiObject({
    agencyId,
    clientId: d.clientId,
    purpose: "writer.rewrite",
    schema: z.object({ subject: z.string(), body: z.string() }),
    system: `${WRITER_SYSTEM}\nNow improve ONE email using reader feedback. Same angle, same facts.`,
    prompt: `Reader feedback (what would make them reply):\n${notes.map((n) => `- ${n}`).join("\n")}\n\nContext:\n${writerPrompt(ctx, [])}\n\nEmail to improve:\nSubject: ${d.subject}\n\n${d.body}`,
    offline: () => ({
      subject: d.subject.length > 45 ? `${ctx.company.name}: quick question` : d.subject,
      body: d.body
        .split("\n\n")
        .filter((p, i, arr) => i === 0 || i >= arr.length - 3 || p.length < 260)
        .join("\n\n"),
    }),
  });
  const ruled = await applyHardRules(ctx, out);
  await db
    .update(drafts)
    .set({ subject: ruled.subject, body: ruled.body, scoreBefore: d.score, violations: [...d.violations, ...ruled.notes] })
    .where(eq(drafts.id, d.id));
  return d.score;
}
