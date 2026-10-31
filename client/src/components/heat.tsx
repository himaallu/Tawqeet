import { ExternalLink } from "lucide-react";
import type { Breakdown, SignalRef, Temperature } from "@/lib/api";
import { cn, isArabic, timeAgo } from "@/lib/utils";
import { Tooltip } from "./ui/misc";

const COLOR: Record<Temperature, string> = { hot: "var(--hot)", warm: "var(--warm)", cold: "var(--cold)" };
const LABEL: Record<Temperature, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };

/** The signature mark: a slim thermometer with its 0–100 score. */
export function Thermometer({ score, temperature, breakdown, size = "md", showLabel = true }: { score: number; temperature: Temperature; breakdown?: Breakdown | null; size?: "sm" | "md" | "lg"; showLabel?: boolean }) {
  const h = size === "lg" ? 44 : size === "sm" ? 22 : 30;
  const w = size === "lg" ? 9 : 6;
  const fill = Math.max(8, Math.min(100, score));
  const mark = (
    <span className="inline-flex items-center gap-2" aria-label={`${LABEL[temperature]}, ${score} out of 100`}>
      <span className="relative flex flex-col items-center" style={{ height: h + w }}>
        <span className="relative overflow-hidden rounded-full bg-surface-3" style={{ width: w, height: h }}>
          <span className="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-700" style={{ height: `${fill}%`, background: COLOR[temperature] }} />
        </span>
        <span className={cn("-mt-1 rounded-full", temperature === "hot" && size !== "sm" && "pulse-hot")} style={{ width: w + 4, height: w + 4, background: COLOR[temperature] }} />
      </span>
      {showLabel && (
        <span className="flex flex-col leading-none">
          <span className={cn("num font-semibold", size === "lg" ? "text-[26px]" : size === "sm" ? "text-[12.5px]" : "text-[15px]")}>{score}</span>
          {size !== "sm" && <span className="mt-1 text-[10.5px] font-medium uppercase tracking-wider" style={{ color: COLOR[temperature] }}>{LABEL[temperature]}</span>}
        </span>
      )}
    </span>
  );
  if (!breakdown) return mark;
  return <Tooltip content={<ScoreBreakdown breakdown={breakdown} />}>{mark}</Tooltip>;
}

export function ScoreBreakdown({ breakdown: b }: { breakdown: Breakdown }) {
  const rows = [
    ["Signals", b.signalPoints, 50],
    ["Stacked signals", b.stackBonus, 15],
    ["ICP fit", b.fitPoints, 25],
    ["Engagement", b.engagement, 15],
  ] as const;
  return (
    <div className="w-64">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-semibold">Thermometer</span>
        <span className="num text-ink-2">{b.total}/100</span>
      </div>
      <div className="grid gap-1.5">
        {rows.map(([label, v, max]) => (
          <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
            <span className="text-ink-2">{label}</span>
            <span className="num">+{Math.round(v)}</span>
            <span className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-ink-2" style={{ width: `${(v / max) * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
      {b.signals.length > 0 && (
        <div className="mt-3 border-t pt-2">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Contributing signals</p>
          {b.signals.slice(0, 5).map((s) => (
            <div key={s.id} className="flex justify-between gap-3 py-0.5">
              <span className="truncate" dir="auto">{s.title}</span>
              <span className="num shrink-0 text-ink-3">+{s.points.toFixed(0)} · {Math.round(s.ageDays)}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TempDot({ temperature, className }: { temperature: Temperature; className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full", className)} style={{ background: COLOR[temperature] }} />;
}

/** Horizontal heat bar used in dense tables. */
export function HeatBar({ score, temperature }: { score: number; temperature: Temperature }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num w-6 text-end text-[12.5px] font-semibold">{score}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, score)}%`, background: COLOR[temperature] }} />
      </span>
    </span>
  );
}

/** 0–100 simulated score ring. */
export function ScoreRing({ score, size = 44, label }: { score: number | null; size?: number; label?: string }) {
  const s = score ?? 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = s >= 75 ? "var(--good)" : s >= 60 ? "var(--warm)" : "var(--hot)";
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} aria-label={`Simulated score ${s} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - s / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span className={cn("num font-semibold", size >= 56 ? "text-[17px]" : "text-[12.5px]")}>{score ?? "–"}</span>
        {label && <span className="mt-0.5 text-[8.5px] uppercase tracking-wider text-ink-3">{label}</span>}
      </span>
    </span>
  );
}

const SIGNAL_ICON: Record<string, string> = {
  funding_round: "◆",
  expansion_new_market: "↗",
  hiring_sales_role: "＋",
  hiring_relevant_role: "＋",
  careers_page_new_roles: "＋",
  leadership_change: "◎",
  tender_published: "▤",
  new_company_registration: "□",
  product_launch: "✦",
  partnership_announced: "⇄",
  event_exhibitor: "◈",
  office_opening: "⌂",
};

export function SignalChip({ s, compact }: { s: Pick<SignalRef, "key" | "name" | "title" | "url" | "source" | "detectedAt">; compact?: boolean }) {
  const inner = (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">
      <span className="text-ink-3">{SIGNAL_ICON[s.key] ?? "•"}</span>
      <span className="truncate font-medium text-ink">{s.name}</span>
      {!compact && <span className="shrink-0 text-ink-3">· {timeAgo(s.detectedAt)}</span>}
    </span>
  );
  return (
    <Tooltip
      content={
        <div className="grid gap-1">
          <span dir="auto" className={cn("font-medium", isArabic(s.title) && "text-[13px]")}>{s.title}</span>
          <span className="text-ink-3">{s.source} · {timeAgo(s.detectedAt)}</span>
          {s.url?.startsWith("http") && (
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-hot hover:underline">
              Open source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      }
    >
      {inner}
    </Tooltip>
  );
}

export { SIGNAL_ICON };
