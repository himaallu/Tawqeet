import { AlertTriangle, Bot, Briefcase, Crown, Languages, ShieldAlert, Sparkles, UserRound, UserSearch } from "lucide-react";
import type { Draft, SimRun } from "@/lib/api";
import { cn, isArabic } from "@/lib/utils";
import { ScoreRing } from "./heat";
import { Badge } from "./ui/badge";

const PERSONA_ICON: Record<string, React.ReactNode> = {
  target: <UserRound />,
  c_level: <Crown />,
  skeptic: <UserSearch />,
  gatekeeper: <Briefcase />,
  ai_agent: <Bot />,
  arabic_first: <Languages />,
};
const ACTION: Record<string, { label: string; tone: "good" | "warm" | "neutral" | "bad" }> = {
  reply: { label: "Would reply", tone: "good" },
  read_ignore: { label: "Reads, ignores", tone: "warm" },
  skip: { label: "Skips", tone: "neutral" },
  spam: { label: "Marks spam", tone: "bad" },
};

function Simulated() {
  return <span className="rounded border border-dashed border-line-2 px-1 text-[9.5px] font-semibold uppercase tracking-wider text-ink-3">Simulated</span>;
}

function SurvivalChecks({ r }: { r: Record<string, any> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {[
        ["Offer", r.keeps_offer],
        ["Why now", r.keeps_why_now],
        ["Ask", r.keeps_ask],
      ].map(([l, ok]) => (
        <Badge key={l as string} tone={ok ? "good" : "bad"}>
          {ok ? "✓" : "✕"} {l as string}
        </Badge>
      ))}
    </div>
  );
}

export function SimulatedInbox({ draft, fromName }: { draft: Draft; fromName: string }) {
  const runs = draft.simRuns;
  const personas = runs.filter((r) => r.check === "persona");
  const gmail = runs.find((r) => r.check === "gmail_summary")?.result;
  const apple = runs.find((r) => r.check === "apple_preview")?.result;
  const spam = runs.find((r) => r.check === "spam")?.result;
  const sim = draft.sim;
  if (!sim || !runs.length) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-ink-3">Not simulated yet.</p>;
  }
  const parts = [
    ["Persona reply likelihood", sim.personaAvg, 50],
    ["Offer survives summaries", sim.offerSurvives, 25],
    ["Deliverability (1 − spam risk)", 1 - sim.spamRisk, 15],
    ["Clarity", sim.clarity, 10],
  ] as const;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4 rounded-xl border bg-surface p-4 shadow-card">
        <ScoreRing score={draft.score} size={64} label="score" />
        <div className="grid flex-1 gap-1.5">
          {parts.map(([label, v, w]) => (
            <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[12px]">
              <span className="text-ink-2">{label}</span>
              <span className="num text-ink-3">
                {Math.round(v * w)}/{w}
              </span>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-ink-2" style={{ width: `${v * 100}%` }} />
              </span>
            </div>
          ))}
        </div>
      </div>
      {draft.scoreBefore !== null && (
        <p className="rounded-lg bg-warm-soft px-3 py-2 text-[12.5px] text-ink-2">
          Auto-rewritten from the personas' feedback: <span className="num font-semibold">{draft.scoreBefore}</span> → <span className="num font-semibold">{draft.score}</span>
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {/* Gmail-style AI summary */}
        <div className="rounded-xl border bg-surface p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-2">Gmail-style summary</span>
            <Simulated />
          </div>
          <div className="rounded-lg bg-[linear-gradient(135deg,oklch(0.96_0.03_260),oklch(0.97_0.03_320))] p-3 dark:bg-[linear-gradient(135deg,oklch(0.28_0.04_260),oklch(0.27_0.04_320))]">
            <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[oklch(0.45_0.15_265)] dark:text-[oklch(0.8_0.1_265)]">
              <Sparkles className="size-3.5" /> Summary
            </div>
            <p dir="auto" className="text-[13px] leading-relaxed">{gmail?.summary ?? gmail?.text}</p>
          </div>
          {gmail && <SurvivalChecks r={gmail} />}
        </div>

        {/* Apple-style lock screen preview */}
        <div className="rounded-xl border bg-surface p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-2">Lock-screen preview</span>
            <Simulated />
          </div>
          <div className="rounded-[18px] bg-[linear-gradient(160deg,oklch(0.45_0.06_250),oklch(0.32_0.05_280))] p-3">
            <div className="rounded-2xl bg-white/75 p-2.5 shadow-sm backdrop-blur-md dark:bg-black/45">
              <div className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded-[6px] bg-[oklch(0.62_0.17_250)] text-white">
                  <svg viewBox="0 0 24 24" className="size-3" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5zm2.2-.3 6.8 5.1 6.8-5.1z" /></svg>
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-black/60 dark:text-white/70">Mail</span>
                <span className="ms-auto text-[11px] text-black/45 dark:text-white/50">now</span>
              </div>
              <div className="mt-1.5 text-[12.5px] font-semibold text-black dark:text-white">{fromName}</div>
              <div dir="auto" className="truncate text-[12.5px] text-black/90 dark:text-white/90">{draft.subject}</div>
              <div dir="auto" className="line-clamp-2 text-[12px] text-black/60 dark:text-white/65">{apple?.preview}</div>
            </div>
          </div>
          {apple && <SurvivalChecks r={apple} />}
        </div>
      </div>

      {/* Persona panel */}
      <div className="rounded-xl border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink-2">Persona panel · 6 readers</span>
          <Simulated />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {personas.map((p: SimRun) => {
            const a = ACTION[p.result.action] ?? ACTION.skip;
            const lk = Number(p.result.reply_likelihood);
            return (
              <div key={p.id} className="rounded-lg border bg-surface-2/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-md bg-surface text-ink-2 shadow-card [&_svg]:size-3.5">{PERSONA_ICON[p.result.key] ?? <UserRound />}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{p.personaName}</span>
                  <Badge tone={a.tone}>{a.label}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span className="block h-full rounded-full bg-good" style={{ width: `${lk * 100}%` }} />
                  </span>
                  <span className="num text-[11.5px] text-ink-3">{Math.round(lk * 100)}%</span>
                </div>
                <p dir="auto" className="mt-2 text-[12px] leading-snug text-ink-2">{p.result.reason}</p>
                <p dir="auto" className="mt-1.5 text-[12px] leading-snug">
                  <span className="text-ink-3">Would reply if: </span>
                  {p.result.what_would_make_me_reply}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spam */}
      <div className="rounded-xl border bg-surface p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
            <ShieldAlert className="size-3.5" /> Deliverability
          </span>
          <Simulated />
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-[20px] font-semibold">{Math.round(sim.spamRisk * 100)}%</span>
          <span className="text-[12px] text-ink-3">spam risk (rules + model)</span>
        </div>
        {(spam?.rules?.length ?? 0) + (spam?.model_reasons?.length ?? 0) === 0 ? (
          <p className="mt-2 text-[12.5px] text-good">No spam triggers found.</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {[...new Set<string>([...(spam?.rules ?? []), ...(spam?.model_reasons ?? [])])].map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warm" /> <span dir="auto">{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SimTag({ className }: { className?: string }) {
  return <span className={cn("contents", className)}><Simulated /></span>;
}

export const isRtl = isArabic;
