import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateBrainCaseStudy, useUpdateBrainCaseStudy, getGetBrainQueryKey, type BrainResponse, type BrainCaseStudy, type CaseStudyInput } from "@workspace/api-client-react";
import { BadgeCheck, CircleDashed, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { invalidateBrain } from "./shared";

const blank: CaseStudyInput = { customerName: "", customerVertical: "", customerCountry: "", customerSizeBand: "", problem: "", solution: "", resultMetric: "", resultValue: "", timeframe: "", quote: "", quotePersonTitle: "", canNameCustomer: false, language: "en", approved: false };

function pick(c: BrainCaseStudy): CaseStudyInput {
  const { id: _i, source: _s, sourceRef: _r, createdAt: _c, ...rest } = c;
  return { ...blank, ...rest };
}

export function CaseStudies({ id, items }: { id: string; items: BrainCaseStudy[] }) {
  const [editing, setEditing] = useState<BrainCaseStudy | "new" | null>(null);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Only human-approved case studies can be cited by writers.</p>
        <Button onClick={() => setEditing("new")} data-testid="button-new-case"><Plus className="h-4 w-4 mr-1.5" />New case study</Button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/60 p-10 text-center" data-testid="status-empty-cases">
          <h3 className="font-display text-xl">No case studies yet</h3>
          <p className="text-sm text-muted-foreground mt-2">Write one by hand, or extract drafts from a PDF, deck or URL in Sources.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {items.map((c) => (
            <article key={c.id} className="rounded-lg border bg-card p-4 flex flex-col gap-2" data-testid={"card-case-" + c.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-medium truncate" dir="auto" data-testid={"text-case-customer-" + c.id}>{c.customerName || "Unnamed customer"}</h4>
                  <p className="text-xs text-muted-foreground font-mono" dir="auto">{[c.customerVertical, c.customerCountry, c.language.toUpperCase()].filter(Boolean).join(" / ")}</p>
                </div>
                {c.approved
                  ? <span className="inline-flex items-center gap-1 rounded-sm bg-chart-3/15 text-chart-3 px-2 py-0.5 text-[11px] font-medium shrink-0" data-testid={"badge-approved-" + c.id}><BadgeCheck className="h-3 w-3" />Approved</span>
                  : <span className="inline-flex items-center gap-1 rounded-sm bg-accent/10 text-accent px-2 py-0.5 text-[11px] font-medium shrink-0" data-testid={"badge-draft-" + c.id}><CircleDashed className="h-3 w-3" />Draft</span>}
              </div>
              <p className="font-display text-lg leading-snug" dir="auto">{[c.resultValue, c.resultMetric].filter(Boolean).join(" ") || "No result recorded"}{c.timeframe && <span className="text-sm text-muted-foreground font-sans"> in {c.timeframe}</span>}</p>
              <p className="text-sm text-muted-foreground line-clamp-2" dir="auto">{c.problem}</p>
              <div className="flex items-center justify-between mt-auto pt-2 border-t">
                <span className="text-[11px] font-mono text-muted-foreground">source: {c.source}{!c.canNameCustomer && " / anonymised"}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(c)} data-testid={"button-edit-case-" + c.id}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          {editing !== null && <CaseForm key={editing === "new" ? "new" : editing.id} id={id} existing={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CaseForm({ id, existing, onDone }: { id: string; existing: BrainCaseStudy | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateBrainCaseStudy();
  const update = useUpdateBrainCaseStudy();
  const [f, setF] = useState<CaseStudyInput>(existing ? pick(existing) : blank);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CaseStudyInput>(k: K, v: CaseStudyInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const pending = saving || create.isPending || update.isPending;

  const submit = async () => {
    if (pending) return;
    if (!f.problem.trim() || !f.solution.trim()) { toast({ title: "Problem and solution are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
        const saved = existing
          ? await update.mutateAsync({ id, caseId: existing.id, data: f })
          : await create.mutateAsync({ id, data: f });
        const key = getGetBrainQueryKey(id);
        await qc.cancelQueries({ queryKey: key });
        qc.setQueryData<BrainResponse>(key, old => old ? {
          ...old,
          caseStudies: old.caseStudies.some(c => c.id === saved.id)
            ? old.caseStudies.map(c => c.id === saved.id ? saved : c)
            : [saved, ...old.caseStudies],
        } : old);
        await invalidateBrain(qc, id);
        toast({ title: existing ? "Case study updated" : "Case study added" });
        onDone();
    } catch (e) {
      toast({ title: "Could not save case study", description: apiErrorMessage(e), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const txt = (k: keyof CaseStudyInput, label: string, area = false) => (
    <div className={"space-y-1.5" + (area ? " md:col-span-2" : "")}>
      <Label htmlFor={"cs-" + k}>{label}</Label>
      {area
        ? <Textarea id={"cs-" + k} dir="auto" rows={3} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} data-testid={"input-case-" + k} />
        : <Input id={"cs-" + k} dir="auto" value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} data-testid={"input-case-" + k} />}
    </div>
  );

  return (
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">{existing ? "Edit case study" : "New case study"}</DialogTitle>
        <DialogDescription>AI-extracted drafts stay unapproved until a person ticks the approval box.</DialogDescription>
      </DialogHeader>
      {existing?.sourceRef && (
        <div className="space-y-1.5"><Label htmlFor="cs-ref">Source reference</Label><Input id="cs-ref" readOnly value={existing.sourceRef} className="font-mono text-xs bg-muted" data-testid="input-case-sourceRef" /></div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {txt("customerName", "Customer")}
        {txt("customerVertical", "Vertical")}
        {txt("customerCountry", "Country")}
        {txt("customerSizeBand", "Size band")}
        {txt("problem", "Problem", true)}
        {txt("solution", "Solution", true)}
        {txt("resultMetric", "Result metric")}
        {txt("resultValue", "Result value")}
        {txt("timeframe", "Timeframe")}
        <div className="space-y-1.5">
          <Label>Language</Label>
          <div className="flex gap-2">
            {(["en", "ar"] as const).map((l) => <Button key={l} type="button" size="sm" variant={f.language === l ? "default" : "outline"} onClick={() => set("language", l)} data-testid={"button-case-lang-" + l}>{l === "en" ? "English" : "Arabic"}</Button>)}
          </div>
        </div>
        {txt("quote", "Quote", true)}
        {txt("quotePersonTitle", "Quote attributed to (title)")}
      </div>
      <div className="space-y-3 rounded-md border bg-secondary/40 p-3">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={f.canNameCustomer} onCheckedChange={(v) => set("canNameCustomer", v === true)} data-testid="checkbox-case-canName" />
          <span>Client has permission to name this customer
            {!f.canNameCustomer && <span className="block text-xs text-muted-foreground" data-testid="text-anonymise-note">Not ticked: future writers will anonymise the customer (e.g. "a Riyadh logistics group").</span>}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={f.approved} onCheckedChange={(v) => set("approved", v === true)} data-testid="checkbox-case-approved" />
          <span><strong>I have verified this case study with the client.</strong><span className="block text-xs text-muted-foreground">Only approved case studies can be cited in outreach.</span></span>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} data-testid="button-cancel-case">Cancel</Button>
        <Button onClick={submit} disabled={pending} data-testid="button-save-case">{pending ? "Saving" : existing ? "Save changes" : "Add case study"}</Button>
      </div>
    </fieldset>
  );
}
