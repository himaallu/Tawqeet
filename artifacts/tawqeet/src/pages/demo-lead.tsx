import { useState } from "react";
import { Link, useParams } from "wouter";
import { useGetDemoLead, getGetDemoLeadQueryKey, useGenerateDemoDrafts, useSimulateDemoDraft, useRewriteDemoDraft, type DemoDraft } from "@workspace/api-client-react";
import { ArrowLeft, ExternalLink, ChevronDown, Wand2, FlaskConical, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, PageHeader } from "@/components/states";
import { Thermometer, SampleBadge, JobBanner, SimulatedInbox, tempStyle } from "@/components/demo-bits";
import { useDemoStatus, useKickStatus } from "@/hooks/use-demo";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { errorToast } from "@/components/error-toast";
import { ContactRights } from "@/components/contact-rights";

export default function DemoLeadPage() {
  const { id = "" } = useParams<{ id: string }>();
  const status = useDemoStatus();
  const kick = useKickStatus();
  const { toast } = useToast();
  const lead = useGetDemoLead(id, { query: { enabled: !!id, queryKey: getGetDemoLeadQueryKey(id) } });
  const gen = useGenerateDemoDrafts();
  const running = !!status.data?.running;

  if (lead.isLoading) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;
  if (lead.isError || !lead.data) return <ErrorPanel message={apiErrorMessage(lead.error)} onRetry={() => lead.refetch()} />;
  const l = lead.data;

  return (
    <div className="rise">
      <Link href="/radar" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4 hover:text-foreground"><ArrowLeft className="h-4 w-4" />Radar</Link>
      <PageHeader eyebrow={`${l.companyName} · ${l.country}`} title={<span dir="auto">{l.fullName}</span>}>
        <Button variant="outline" disabled={running || gen.isPending} data-testid="button-generate-drafts"
          onClick={() => gen.mutate({ id: l.id }, { onSuccess: () => { kick(); toast({ title: "Generating drafts" }); }, onError: (e) => toast(errorToast("Could not generate", e)) })}>
          <Sparkles className="h-4 w-4 mr-2" />Regenerate drafts
        </Button>
        <ContactRights leadId={l.id} name={l.fullName} />
      </PageHeader>
      <JobBanner status={status.data} />
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <span className={"rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase " + tempStyle[l.temperature]}>{l.temperature}</span>
        <span dir="auto">{l.title}</span><SampleBadge sample={l.sample} />
        <span className="font-mono text-xs text-muted-foreground uppercase">lang: {l.language}</span>
        <span className="rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" data-testid="text-legal-basis">Legal basis: {l.legalBasis}</span>
      </div>
      {l.sample && <p className="text-xs text-muted-foreground mb-4">Illustrative sample contact for the shared demo workspace. Approved emails go only to the demo recipient, never to this contact.</p>}
      <div className="max-w-md mb-6"><Thermometer lead={l} /></div>

      <section className="rounded-lg border bg-card p-5 mb-8">
        <h2 className="font-display text-xl mb-3">Evidence</h2>
        <ul className="space-y-3">
          {l.signals.map((s) => (
            <li key={s.id} className="border-l-2 border-accent/50 pl-3 text-sm">
              <div className="flex justify-between gap-2"><span className="font-medium">{s.name} <span className="text-muted-foreground font-normal">· {s.title}</span></span><span className="font-mono text-accent">+{s.points}</span></div>
              <p className="italic text-muted-foreground mt-1" dir="auto">"{s.evidenceQuote}"</p>
              <div className="text-xs text-muted-foreground mt-1">{new Date(s.detectedAt).toLocaleDateString()}{s.url && <> · <a href={s.url} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-1 hover:underline">source <ExternalLink className="h-3 w-3" /></a></>}</div>
            </li>
          ))}
          {l.signals.length === 0 && <li className="text-sm text-muted-foreground">No evidence recorded.</li>}
        </ul>
        <div className="mt-3 pt-3 border-t font-mono text-xs text-muted-foreground">signals {l.signalPoints} + stacking {l.stackingBonus} = {l.totalScore}</div>
      </section>

      <h2 className="font-display text-2xl mb-3">Draft variants</h2>
      {l.drafts.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No drafts yet. Use Regenerate drafts.</div> : (
        <div className="space-y-4">{[...l.drafts].sort((a, b) => a.variant - b.variant).map((d) => <DraftCard key={d.id} d={d} running={running} />)}</div>
      )}
      <p className="text-xs text-muted-foreground mt-6">Drafts are for review. Approve & Send in Review & Send delivers only to the demo recipient.</p>
    </div>
  );
}

function DraftCard({ d, running }: { d: DemoDraft; running: boolean }) {
  const [open, setOpen] = useState(false);
  const kick = useKickStatus();
  const { toast } = useToast();
  const sim = useSimulateDemoDraft();
  const rw = useRewriteDemoDraft();
  const cb = (title: string) => ({ onSuccess: () => { kick(); setOpen(true); toast({ title }); }, onError: (e: unknown) => toast(errorToast("Action failed", e)) });
  const err = sim.error ?? rw.error;

  return (
    <article className="rounded-lg border bg-card overflow-hidden" data-testid={`card-draft-${d.id}`}>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Variant {d.variant}</span><span>· {d.language}</span><span>· {d.model}</span>
          {d.score !== null && <span className="ml-auto rounded-sm bg-accent/15 text-accent px-1.5 py-0.5">Score {d.score}</span>}
        </div>
        <h3 className="font-medium mt-2" dir="auto">{d.subject}</h3>
        <p className="mt-2 text-sm whitespace-pre-wrap leading-relaxed" dir="auto">{d.body}</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button size="sm" variant="outline" disabled={running || sim.isPending} onClick={() => sim.mutate({ id: d.id }, cb("Simulation started"))} data-testid={`button-simulate-${d.id}`}><FlaskConical className="h-3.5 w-3.5 mr-1.5" />{sim.isPending ? "Starting" : "Run simulation"}</Button>
          <Button size="sm" variant="outline" disabled={running || rw.isPending} onClick={() => rw.mutate({ id: d.id }, cb("Rewrite started"))} data-testid={`button-rewrite-${d.id}`}><Wand2 className="h-3.5 w-3.5 mr-1.5" />{rw.isPending ? "Starting" : "Rewrite"}</Button>
          <button onClick={() => setOpen(!open)} className="ml-auto text-sm inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" data-testid={`toggle-inbox-${d.id}`}>Simulated inbox <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} /></button>
        </div>
        {err && <p role="alert" className="text-sm text-destructive mt-2">{apiErrorMessage(err)}</p>}
      </div>
      {open && <div className="border-t bg-secondary/30 p-5 text-sm"><SimulatedInbox d={d} /></div>}
    </article>
  );
}
