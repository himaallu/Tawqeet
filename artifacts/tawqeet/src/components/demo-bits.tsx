import type { DemoLead } from "@workspace/api-client-react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DemoStatus } from "@workspace/api-client-react";

export const tempStyle: Record<string, string> = {
  hot: "bg-[hsl(12_82%_56%)] text-white",
  warm: "bg-[hsl(38_85%_55%)] text-[hsl(30_40%_15%)]",
  cold: "bg-[hsl(205_45%_55%)] text-white",
};

export function SampleBadge({ sample }: { sample: boolean }) {
  if (!sample) return null;
  return <span className="rounded-sm border border-accent/50 bg-accent/10 text-accent px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider" data-testid="badge-sample">Sample contact</span>;
}

export function Thermometer({ lead }: { lead: DemoLead }) {
  const pct = Math.max(4, Math.min(100, lead.totalScore));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-3 group text-left w-full" data-testid={`button-score-${lead.id}`} aria-label="Show score evidence">
          <div className="relative h-2 flex-1 rounded-full bg-secondary overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[hsl(205_45%_55%)] via-[hsl(38_85%_55%)] to-[hsl(12_82%_56%)]" style={{ width: pct + "%" }} />
          </div>
          <span className="font-mono text-sm tabular-nums underline decoration-dotted underline-offset-4 group-hover:text-accent">{lead.totalScore}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[70vh] overflow-y-auto">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Score evidence</div>
        <ul className="mt-2 space-y-3">
          {lead.signals.map((s) => (
            <li key={s.id} className="text-sm border-l-2 border-accent/50 pl-3">
              <div className="flex justify-between gap-2"><span className="font-medium">{s.name}</span><span className="font-mono text-accent">+{s.points}</span></div>
              <p className="text-muted-foreground italic mt-1" dir="auto">"{s.evidenceQuote}"</p>
              {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent mt-1 hover:underline">Source <ExternalLink className="h-3 w-3" /></a>}
            </li>
          ))}
          {lead.signals.length === 0 && <li className="text-sm text-muted-foreground">No signals yet.</li>}
        </ul>
        <dl className="mt-3 pt-3 border-t text-sm space-y-1 font-mono">
          <div className="flex justify-between"><dt>Signal points</dt><dd>{lead.signalPoints}</dd></div>
          <div className="flex justify-between"><dt>Stacking bonus</dt><dd>+{lead.stackingBonus}</dd></div>
          <div className="flex justify-between"><dt>Illustrative fit points</dt><dd>{Math.max(0, Math.round(lead.totalScore - lead.signalPoints))}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{lead.totalScore}</dd></div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

export function JobBanner({ status }: { status?: DemoStatus }) {
  if (!status) return null;
  if (!status.running && !status.error && status.warnings.length === 0) return null;
  return (
    <div className="mb-5 rounded-md border bg-card p-3 text-sm space-y-1" data-testid="status-demo-job">
      {status.running && <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-accent" />Working: <span className="font-mono">{status.stage}</span></div>}
      {status.error && <div className="text-destructive">Last job failed: {status.error}</div>}
      {status.warnings.map((w, i) => <div key={i} className="text-muted-foreground">Warning: {w}</div>)}
    </div>
  );
}
