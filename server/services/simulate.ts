import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { PERSONA_ACTIONS } from "../../shared/enums";
import { db } from "../db";
import { clients, companies, drafts, leads, leadSignals, signals, simRuns, type DraftSim } from "../db/schema";
import { aiObject } from "../lib/ai";
import { clarity, simScore, WINNER_REWRITE_THRESHOLD } from "../lib/sim-score";
import { askCount, hasOptOut, linkCount, spamRules, wordCount } from "../lib/spam";
import { markReady } from "./alerts";
import { assertCanSimulate } from "./usage";
import { rewriteWithNotes } from "./writer";

/**
 * Simulated inbox. Every check is labelled "Simulated" in the UI.
 *   1. Persona panel (6)   2. Gmail-style AI summary   3. Apple-style one-line preview
 *   4. Spam/deliverability (rules + model)
 * score = 50·avg(reply) + 25·offer_survives + 15·(1 − spam) + 10·clarity
 */

export const PERSONAS = [
  { key: "target", name: "The target lead" },
  { key: "c_level", name: "Busy GCC C-level executive" },
  { key: "skeptic", name: "Skeptical buyer (20 cold emails a day)" },
  { key: "gatekeeper", name: "Executive assistant / gatekeeper" },
  { key: "ai_agent", name: "AI email assistant (triage agent)" },
  { key: "arabic_first", name: "Arabic-first GCC decision maker" },
] as const;

const personaSchema = z.object({
  action: z.enum(PERSONA_ACTIONS),
  reply_likelihood: z.number().min(0).max(1),
  reason: z.string(),
  what_would_make_me_reply: z.string(),
});
export type PersonaVerdict = z.infer<typeof personaSchema>;

const survivalSchema = z.object({
  text: z.string(),
  keeps_offer: z.boolean(),
  keeps_why_now: z.boolean(),
  keeps_ask: z.boolean(),
});

type Ctx = {
  agencyId: string;
  clientId: string;
  draft: typeof drafts.$inferSelect;
  lead: typeof leads.$inferSelect;
  company: typeof companies.$inferSelect;
  client: typeof clients.$inferSelect;
  signalTitles: string[];
};

function personaBrief(key: string, ctx: Ctx): string {
  const { lead, company, signalTitles } = ctx;
  switch (key) {
    case "target":
      return `You are ${lead.fullName ?? "the recipient"}, ${lead.title ?? "a manager"} at ${company.name} (${company.country ?? "GCC"}). Recent news about your company: ${signalTitles.join("; ") || "none"}.`;
    case "c_level":
      return "You are a C-level executive at a large GCC company. You read email on your phone between meetings and give each cold email 3 seconds.";
    case "skeptic":
      return "You are a buyer who receives 20 cold emails a day. You assume every claim is exaggerated and delete anything generic.";
    case "gatekeeper":
      return "You are an executive assistant who screens your boss's inbox. You forward only emails that are clearly relevant and respectful of their time.";
    case "ai_agent":
      return "You are an AI email assistant triaging an executive's inbox. Decide whether to surface, summarise, or archive this email. Map: surface → reply, summarise → read_ignore, archive → skip, spam folder → spam.";
    default:
      return "You are an Arabic-first GCC decision maker. You value respectful, relationship-aware business communication. For Arabic emails, judge the quality of the Arabic (natural Modern Standard Arabic, not a translation). For English emails, judge cultural fit for the Gulf.";
  }
}

// ---------- offline (deterministic) checks ----------

type Features = {
  words: number;
  asks: number;
  links: number;
  mentionsSignal: boolean;
  opensWithSignal: boolean;
  hasNumber: boolean;
  proof: boolean;
  subjectSpecific: boolean;
  subjectWords: number;
  spam: number;
  personal: boolean;
  arabic: boolean;
  leadArabic: boolean;
};

function features(ctx: Ctx): Features {
  const b = ctx.draft.body;
  const lower = b.toLowerCase();
  const signalWords = ctx.signalTitles.flatMap((t) => t.split(/\s+/).filter((w) => w.length > 4).map((w) => w.toLowerCase()));
  const paragraphs = b.split(/\n\s*\n/).map((x) => x.toLowerCase());
  const subject = ctx.draft.subject.toLowerCase();
  return {
    words: wordCount(b),
    asks: askCount(b),
    links: linkCount(b),
    mentionsSignal: signalWords.some((w) => lower.includes(w)) || lower.includes(ctx.company.name.toLowerCase()),
    opensWithSignal: signalWords.some((w) => (paragraphs[1] ?? "").includes(w)),
    hasNumber: /\d|[٠-٩]/.test(b.replace(/15|١٥/g, "")),
    proof: ctx.draft.caseStudyId !== null || /we helped|ساعدنا/.test(lower),
    subjectSpecific: subject.includes(ctx.company.name.toLowerCase()) || signalWords.some((w) => subject.includes(w)),
    subjectWords: wordCount(ctx.draft.subject),
    spam: spamRules(ctx.draft.subject, b).risk,
    personal: ctx.lead.fullName ? b.includes(ctx.lead.fullName.split(" ")[0]) : false,
    arabic: /[؀-ۿ]/.test(b),
    leadArabic: ctx.lead.language === "ar",
  };
}

/** Deterministic persona model for offline mode: each persona weighs different features. */
export function offlinePersona(key: string, f: Features): PersonaVerdict {
  let p = 0.16;
  if (f.mentionsSignal) p += 0.1;
  if (f.opensWithSignal) p += 0.05;
  if (f.hasNumber) p += 0.06;
  if (f.proof) p += 0.04;
  if (f.subjectSpecific) p += 0.04;
  if (f.asks === 1) p += 0.05;
  if (f.personal) p += 0.03;
  p -= Math.max(0, f.words - 70) * 0.002; // every word past 70 costs a little
  if (f.links > 1) p -= 0.08;
  p -= f.spam * 0.3;
  const bias: Record<string, number> = {
    target: f.opensWithSignal ? 0.08 : 0.02,
    c_level: f.words < 70 ? 0.05 : -0.06,
    skeptic: f.proof ? 0.06 : f.hasNumber ? 0 : -0.12,
    gatekeeper: f.subjectSpecific ? 0 : -0.08,
    ai_agent: (f.subjectSpecific ? 0.03 : -0.08) + (f.subjectWords <= 7 ? 0.02 : -0.03),
    arabic_first: f.leadArabic ? (f.arabic ? 0.07 : -0.1) : -0.02,
  };
  p = Math.max(0.02, Math.min(0.9, p + (bias[key] ?? 0)));
  const action = f.spam > 0.6 ? "spam" : p >= 0.4 ? "reply" : p >= 0.25 ? "read_ignore" : "skip";
  const reasons: string[] = [];
  reasons.push(f.mentionsSignal ? "it references something real about my company" : "it feels generic");
  if (f.words > 100) reasons.push("it runs long");
  if (key === "skeptic" && !f.proof) reasons.push("there's no proof from a company like mine");
  if (key === "gatekeeper" && !f.subjectSpecific) reasons.push("the subject doesn't say why my boss should care");
  const wants = !f.mentionsSignal
    ? "Open with something specific about us."
    : key === "skeptic" && !f.proof
      ? "Show one concrete result from a similar company."
      : !f.subjectSpecific
        ? "Put our company or the news in the subject line."
        : f.words > 90
          ? "Cut it to five lines."
          : "Make the ask even smaller — a yes/no question.";
  const verb = { reply: "reply", read_ignore: "read it and move on", skip: "skip it", spam: "mark it as spam" }[action];
  return { action, reply_likelihood: Math.round(p * 100) / 100, reason: `I'd ${verb} because ${reasons.join(" and ")}.`, what_would_make_me_reply: wants };
}

function offlineSurvival(text: string, ctx: Ctx) {
  const lower = text.toLowerCase();
  const offerWords = (ctx.client.offer ?? ctx.client.name).toLowerCase().split(/\W+/).filter((w) => w.length > 5).slice(0, 6);
  return {
    text,
    keeps_offer: offerWords.some((w) => lower.includes(w)) || lower.includes(ctx.client.name.toLowerCase()),
    keeps_why_now: lower.includes(ctx.company.name.toLowerCase()) || ctx.signalTitles.some((t) => lower.includes(t.toLowerCase().slice(0, 20))),
    keeps_ask: /[?؟]|call|chat|اتصال/.test(lower),
  };
}

/** Apple Mail shows the first ~90 characters of the body after the greeting. */
export function applePreviewText(body: string): string {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const start = /^(hi|hello|dear|مرحباً|مرحبا|السلام)/i.test(lines[0] ?? "") ? 1 : 0;
  const text = lines.slice(start).join(" ");
  return text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text;
}

// ---------- the simulation ----------

const survives = (s: z.infer<typeof survivalSchema>) => [s.keeps_offer, s.keeps_why_now, s.keeps_ask].filter(Boolean).length / 3;

export async function simulateDraft(ctx: Ctx): Promise<DraftSim> {
  const { agencyId, clientId, draft } = ctx;
  const f = features(ctx);
  const email = `Subject: ${draft.subject}\n\n${draft.body}`;

  const personaCalls = PERSONAS.map(async (p) => {
    const verdict = await aiObject({
      agencyId,
      clientId,
      purpose: "sim.persona",
      tier: "fast",
      schema: personaSchema,
      system: `${personaBrief(p.key, ctx)}\nYou just received this cold email. React honestly as this person would. reply_likelihood is 0–1.`,
      prompt: email,
      offline: () => offlinePersona(p.key, f),
    });
    return { persona: p, verdict };
  });

  const gmailCall = aiObject({
    agencyId,
    clientId,
    purpose: "sim.gmail_summary",
    tier: "fast",
    prefer: "gemini",
    schema: survivalSchema,
    system:
      "Summarise this email in 1–2 sentences as an inbox assistant would (text). Then judge whether the summary keeps: the offer (keeps_offer), the reason to act now (keeps_why_now), and the ask (keeps_ask).",
    prompt: email,
    offline: () => {
      const lines = draft.body.split("\n").map((l) => l.trim()).filter((l) => l.length > 20 && !hasOptOut(l));
      return offlineSurvival(`${ctx.client.name} ${lines[0]?.toLowerCase().startsWith("saw") || lines[0]?.startsWith("لاحظت") ? "noticed" : "wrote about"} ${ctx.company.name}: ${lines.slice(0, 2).join(" ").slice(0, 200)}`, ctx);
    },
  });

  const preview = applePreviewText(draft.body);
  const appleCall = aiObject({
    agencyId,
    clientId,
    purpose: "sim.apple_preview",
    tier: "fast",
    schema: survivalSchema,
    system:
      "This is the one-line preview (max 90 characters) a phone lock screen shows for an email. Return it unchanged as text, then judge whether this line alone conveys the offer, the reason to act now, and the ask.",
    prompt: `Sender: ${ctx.client.name}\nSubject: ${draft.subject}\nPreview: ${preview}`,
    offline: () => offlineSurvival(preview, ctx),
  });

  const rules = spamRules(draft.subject, draft.body);
  const spamCall = aiObject({
    agencyId,
    clientId,
    purpose: "sim.spam",
    tier: "fast",
    schema: z.object({ spam_risk: z.number().min(0).max(1), reasons: z.array(z.string()) }),
    system: "You are a deliverability filter. Rate how likely this email is to be flagged as spam or promotional (0–1) and list reasons.",
    prompt: email,
    offline: () => ({ spam_risk: rules.risk, reasons: rules.flags }),
  });

  const [personas, gmail, apple, spamModel] = await Promise.all([Promise.all(personaCalls), gmailCall, appleCall, spamCall]);
  const spamRisk = Math.round((0.5 * rules.risk + 0.5 * spamModel.spam_risk) * 100) / 100;
  const offerSurvives = Math.round(((survives(gmail) + survives(apple)) / 2) * 100) / 100;
  const clar = clarity(draft.body);
  const score = simScore({ replyLikelihoods: personas.map((p) => p.verdict.reply_likelihood), offerSurvives, spamRisk, clarity: clar });

  await db.delete(simRuns).where(eq(simRuns.draftId, draft.id));
  await db.insert(simRuns).values([
    ...personas.map((p) => ({ agencyId, draftId: draft.id, check: "persona" as const, personaName: p.persona.name, result: { key: p.persona.key, ...p.verdict } })),
    { agencyId, draftId: draft.id, check: "gmail_summary" as const, result: { summary: gmail.text, ...gmail, survives: survives(gmail) } },
    { agencyId, draftId: draft.id, check: "apple_preview" as const, result: { preview, ...apple, survives: survives(apple) } },
    { agencyId, draftId: draft.id, check: "spam" as const, result: { rules: rules.flags, rules_risk: rules.risk, model_risk: spamModel.spam_risk, model_reasons: spamModel.reasons, spam_risk: spamRisk } },
  ]);

  const sim: DraftSim = {
    score,
    personaAvg: Math.round((personas.reduce((a, p) => a + p.verdict.reply_likelihood, 0) / personas.length) * 100) / 100,
    offerSurvives,
    spamRisk,
    clarity: clar,
    spamFlags: rules.flags,
    gmailSummary: gmail.text,
    applePreview: preview,
    simulatedAt: new Date().toISOString(),
  };
  await db.update(drafts).set({ score, sim }).where(eq(drafts.id, draft.id));
  return sim;
}

async function contextFor(agencyId: string, draftId: string): Promise<Ctx | null> {
  const [row] = await db
    .select({ draft: drafts, lead: leads, company: companies, client: clients })
    .from(drafts)
    .innerJoin(leads, eq(leads.id, drafts.leadId))
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .innerJoin(clients, eq(clients.id, drafts.clientId))
    .where(and(eq(drafts.agencyId, agencyId), eq(drafts.id, draftId)));
  if (!row) return null;
  const sigs = await db
    .select({ title: signals.title })
    .from(leadSignals)
    .innerJoin(signals, eq(signals.id, leadSignals.signalId))
    .where(eq(leadSignals.leadId, row.lead.id))
    .orderBy(desc(signals.detectedAt))
    .limit(5);
  return { agencyId, clientId: row.client.id, ...row, signalTitles: sigs.map((s) => s.title) };
}

/** Re-simulate one draft (e.g. after a human edit). */
export async function simulateOne(agencyId: string, draftId: string) {
  await assertCanSimulate(agencyId, 1);
  const ctx = await contextFor(agencyId, draftId);
  if (!ctx) throw new Error("Draft not found");
  return simulateDraft(ctx);
}

/**
 * Simulate all 3 variants, mark the winner, auto-rewrite once if it scores < 60, then mark the
 * lead ready (which triggers alerts).
 */
export async function simulateLead(agencyId: string, leadId: string) {
  const rows = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.agencyId, agencyId), eq(drafts.leadId, leadId), inArray(drafts.status, ["generated", "winner", "edited"])));
  if (!rows.length) return null;
  await assertCanSimulate(agencyId, rows.length);
  for (const d of rows) {
    const ctx = await contextFor(agencyId, d.id);
    if (ctx) await simulateDraft(ctx);
  }

  const scored = await db.select().from(drafts).where(and(eq(drafts.leadId, leadId), inArray(drafts.status, ["generated", "winner", "edited"])));
  let winner = scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  if ((winner.score ?? 0) < WINNER_REWRITE_THRESHOLD && winner.scoreBefore === null) {
    const notes = (
      await db.select().from(simRuns).where(and(eq(simRuns.draftId, winner.id), eq(simRuns.check, "persona")))
    ).map((r) => String(r.result.what_would_make_me_reply ?? ""));
    await rewriteWithNotes(agencyId, winner.id, [...new Set(notes)].filter(Boolean));
    const ctx = await contextFor(agencyId, winner.id);
    if (ctx) await simulateDraft(ctx);
    [winner] = await db.select().from(drafts).where(eq(drafts.id, winner.id));
  }

  await db.update(drafts).set({ status: "generated" }).where(and(eq(drafts.leadId, leadId), eq(drafts.status, "winner")));
  await db.update(drafts).set({ status: "winner" }).where(eq(drafts.id, winner.id));
  await markReady(agencyId, leadId);
  return { winnerId: winner.id, score: winner.score, before: winner.scoreBefore };
}
