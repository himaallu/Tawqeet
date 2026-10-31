import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSignalDefinitions, useUpdateSignalDefinition, getListSignalDefinitionsQueryKey, getListSignalLeadsQueryKey,
  type User, type SignalDefinition, type SignalDefinitionInput, type ListSignalDefinitions200,
} from "@workspace/api-client-react";
import { Pencil, Check, X, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, PageHeader, Restricted } from "@/components/states";
import { can } from "@/lib/roles";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

type Draft = { baseWeight: string; halfLifeDays: string; saas: string; re: string; hr: string; keywordsEn: string; keywordsAr: string; active: boolean };

const toDraft = (d: SignalDefinition): Draft => ({
  baseWeight: String(d.baseWeight), halfLifeDays: String(d.halfLifeDays),
  saas: String(d.verticalMultipliers.saas), re: String(d.verticalMultipliers.re), hr: String(d.verticalMultipliers.hr),
  keywordsEn: d.keywordsEn.join(", "), keywordsAr: d.keywordsAr.join("، "), active: d.active,
});
const splitKw = (s: string) => s.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);

function validate(d: Draft): SignalDefinitionInput | string {
  const w = Number(d.baseWeight), h = Number(d.halfLifeDays);
  if (d.baseWeight.trim() === "" || !Number.isInteger(w) || w < -40 || w > 40) return "Weight must be a whole number from -40 to 40.";
  if (d.halfLifeDays.trim() === "" || !Number.isInteger(h) || h < 1 || h > 3650) return "Half-life must be a whole number of days from 1 to 3650.";
  const m = { saas: Number(d.saas), re: Number(d.re), hr: Number(d.hr) };
  for (const [k, v] of Object.entries(m)) if ([d.saas, d.re, d.hr].some((x) => x.trim() === "") || !Number.isFinite(v) || v < 0 || v > 10) return `Multiplier ${k.toUpperCase()} must be between 0 and 10.`;
  const en = splitKw(d.keywordsEn), ar = splitKw(d.keywordsAr);
  if (en.length > 100 || ar.length > 100) return "Up to 100 keywords per language.";
  if ([...en, ...ar].some((k) => k.length > 200)) return "Each keyword must be 200 characters or fewer.";
  return { baseWeight: w, halfLifeDays: h, verticalMultipliers: m, keywordsEn: en, keywordsAr: ar, active: d.active };
}

const mono = "font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground";

function DefinitionCard({ def, canEdit }: { def: SignalDefinition; canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateSignalDefinition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const pending = update.isPending;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => d && { ...d, [k]: e.target.value });

  const save = async () => {
    if (!draft) return;
    const v = validate(draft);
    if (typeof v === "string") { setErr(v); return; }
    setErr(null);
    try {
      const saved = await update.mutateAsync({ key: def.key, data: v });
      qc.setQueryData<ListSignalDefinitions200>(getListSignalDefinitionsQueryKey(), (old) =>
        old ? { ...old, definitions: old.definitions.map((x) => (x.key === def.key ? { ...x, ...v, ...saved } : x)) } : old);
      setDraft(null);
      setSavedAt(new Date());
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListSignalDefinitionsQueryKey() }),
        qc.invalidateQueries({ queryKey: getListSignalLeadsQueryKey() }),
      ]);
      toast({ title: "Signal saved", description: def.name });
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  };

  const Trend = def.isNegative ? TrendingDown : TrendingUp;
  return (
    <article className={"rounded-lg border bg-card p-5 " + (def.active ? "" : "opacity-70")} data-testid={`card-signal-${def.key}`}>
      <div className="flex items-start gap-3">
        <Trend className={"h-5 w-5 mt-0.5 shrink-0 " + (def.isNegative ? "text-destructive" : "text-accent")} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-display text-lg font-semibold" dir="auto">{def.name}</h3>
            <code className="font-mono text-[11px] text-muted-foreground">{def.key}</code>
            <span className={mono}>{def.scope}</span>
            {!def.active && <span className="rounded-sm border px-1.5 font-mono text-[10px] uppercase">Inactive</span>}
          </div>
          <p className="text-sm text-muted-foreground mt-1" dir="auto">{def.description}</p>
        </div>
        {canEdit && !draft && (
          <Button size="sm" variant="outline" onClick={() => { setDraft(toDraft(def)); setErr(null); }} data-testid={`button-edit-signal-${def.key}`}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
          </Button>
        )}
      </div>

      {!draft ? (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t text-sm">
            <div><dt className={mono}>Weight</dt><dd className="mt-1 font-mono tabular-nums" data-testid={`text-signal-weight-${def.key}`}>{def.baseWeight > 0 ? "+" : ""}{def.baseWeight}</dd></div>
            <div><dt className={mono}>Half-life</dt><dd className="mt-1 font-mono tabular-nums" data-testid={`text-signal-halflife-${def.key}`}>{def.halfLifeDays}d</dd></div>
            <div><dt className={mono}>SaaS</dt><dd className="mt-1 font-mono">x{def.verticalMultipliers.saas}</dd></div>
            <div><dt className={mono}>Real estate</dt><dd className="mt-1 font-mono">x{def.verticalMultipliers.re}</dd></div>
            <div><dt className={mono}>HR</dt><dd className="mt-1 font-mono">x{def.verticalMultipliers.hr}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {def.keywordsEn.map((k, i) => <span key={`en-${i}`} dir="auto" className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs">{k}</span>)}
            {def.keywordsAr.map((k, i) => <span key={`ar-${i}`} dir="auto" lang="ar" className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-xs">{k}</span>)}
          </div>
          <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {def.sourceTypes.length > 0 && <div>Sources: <span dir="auto">{def.sourceTypes.join(", ")}</span></div>}
            {def.targetPersonas.length > 0 && <div>Personas: <span dir="auto">{def.targetPersonas.join(", ")}</span></div>}
            {def.exclusions.length > 0 && <div>Exclusions: <span dir="auto">{def.exclusions.join(", ")}</span></div>}
            {def.playHint && <div>Play: <span dir="auto">{def.playHint}</span></div>}
          </div>
          {savedAt && <p className="mt-3 text-xs text-[hsl(160_45%_36%)] flex items-center gap-1" role="status" data-testid={`status-signal-saved-${def.key}`}><Check className="h-3.5 w-3.5" />Saved at {savedAt.toLocaleTimeString()}</p>}
        </>
      ) : (
        <form className="mt-4 pt-4 border-t" onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid={`form-signal-${def.key}`}>
          <fieldset disabled={pending} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {([["baseWeight", "Weight (-40..40)"], ["halfLifeDays", "Half-life days"], ["saas", "SaaS x"], ["re", "Real estate x"], ["hr", "HR x"]] as const).map(([k, l]) => (
              <div key={k}>
                <Label htmlFor={`${def.key}-${k}`} className={mono}>{l}</Label>
                <Input id={`${def.key}-${k}`} inputMode="decimal" value={draft[k]} onChange={set(k)} className="mt-1 font-mono" data-testid={`input-signal-${k}-${def.key}`} />
              </div>
            ))}
            <div className="col-span-2 sm:col-span-5 grid sm:grid-cols-2 gap-3">
              <div><Label htmlFor={`${def.key}-en`} className={mono}>Keywords EN (comma separated)</Label>
                <Input id={`${def.key}-en`} dir="auto" value={draft.keywordsEn} onChange={set("keywordsEn")} className="mt-1" data-testid={`input-signal-keywordsEn-${def.key}`} /></div>
              <div><Label htmlFor={`${def.key}-ar`} className={mono}>Keywords AR</Label>
                <Input id={`${def.key}-ar`} dir="auto" lang="ar" value={draft.keywordsAr} onChange={set("keywordsAr")} className="mt-1" data-testid={`input-signal-keywordsAr-${def.key}`} /></div>
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((d) => d && { ...d, active: e.target.checked })} data-testid={`input-signal-active-${def.key}`} />Active
            </label>
          </fieldset>
          {err && <p role="alert" className="text-sm text-destructive mt-3" data-testid={`text-signal-error-${def.key}`}>{err}</p>}
          <div className="mt-4 flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setDraft(null); setErr(null); }} data-testid={`button-cancel-signal-${def.key}`}><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
            <Button type="submit" size="sm" disabled={pending} data-testid={`button-save-signal-${def.key}`}>{pending ? "Saving" : "Save signal"}</Button>
          </div>
        </form>
      )}
    </article>
  );
}

export default function SignalsPage({ user }: { user: User }) {
  const perms = can(user);
  const q = useListSignalDefinitions({ query: { enabled: perms.viewSignals, queryKey: getListSignalDefinitionsQueryKey(), notifyOnChangeProps: "all" } });
  if (!perms.viewSignals) return <Restricted title="Signals are staff only">Client viewers cannot open the signal catalogue.</Restricted>;
  return (
    <div className="rise max-w-4xl">
      <PageHeader eyebrow="Settings / Signals" title="Signal catalogue">
        {q.data && <span className="rounded-md border bg-card px-3 py-1.5 font-mono text-sm" data-testid="text-signal-count">{q.data.count} signals</span>}
      </PageHeader>
      <p className="text-sm text-muted-foreground -mt-2 mb-6">Evidence-based triggers shared across the agency. {perms.editSignals ? "Edits apply to every client's scoring." : "Read only. Ask the agency owner to change weights or keywords."}</p>
      {q.isLoading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : q.isError || !q.data ? (
        <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.definitions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground" data-testid="status-signals-empty">No signal definitions yet.</div>
      ) : (
        <div className="space-y-3" data-testid="list-signals">
          {q.data.definitions.map((d) => <DefinitionCard key={d.key} def={d} canEdit={perms.editSignals} />)}
        </div>
      )}
    </div>
  );
}
