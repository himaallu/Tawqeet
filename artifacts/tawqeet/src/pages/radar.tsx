import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useGetDemoRadar, getGetDemoRadarQueryKey, useRunDemoRadar, useAddDemoSignal } from "@workspace/api-client-react";
import { Radar as RadarIcon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, PageHeader } from "@/components/states";
import { Thermometer, SampleBadge, JobBanner, tempStyle } from "@/components/demo-bits";
import { useDemoStatus, useKickStatus } from "@/hooks/use-demo";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

const temps = ["all", "hot", "warm", "cold"] as const;

export default function RadarPage() {
  const status = useDemoStatus();
  const kick = useKickStatus();
  const { toast } = useToast();
  const radar = useGetDemoRadar({ query: { queryKey: getGetDemoRadarQueryKey() } });
  const run = useRunDemoRadar();
  const add = useAddDemoSignal();
  const [filter, setFilter] = useState<(typeof temps)[number]>("all");
  const [url, setUrl] = useState("");
  const [companyId, setCompanyId] = useState("");
  const running = !!status.data?.running;

  const doRun = () => run.mutate(undefined, {
    onSuccess: () => { kick(); toast({ title: "Radar scan started" }); },
    onError: (e) => toast({ title: "Could not start radar", description: apiErrorMessage(e), variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !/^https?:\/\//.test(url.trim())) { toast({ title: "Pick a company and enter an http(s) URL", variant: "destructive" }); return; }
    add.mutate({ data: { companyId, url: url.trim() } }, {
      onSuccess: () => { kick(); setUrl(""); toast({ title: "Signal queued for analysis" }); },
      onError: (e2) => toast({ title: "Could not add signal", description: apiErrorMessage(e2), variant: "destructive" }),
    });
  };

  const leads = (radar.data?.leads ?? []).filter((l) => filter === "all" || l.temperature === filter).sort((a, b) => b.totalScore - a.totalScore);
  const companies = radar.data?.companies ?? [];

  return (
    <div className="rise">
      <PageHeader eyebrow="Workspace" title="Radar">
        <Button onClick={doRun} disabled={running || run.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90" data-testid="button-run-radar">
          <RadarIcon className="h-4 w-4 mr-2" />{running ? "Scan running" : "Run radar now"}
        </Button>
      </PageHeader>
      <JobBanner status={status.data} />
      {radar.isLoading ? <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : radar.isError ? <ErrorPanel message={apiErrorMessage(radar.error)} onRetry={() => radar.refetch()} />
        : (
          <div className="grid lg:grid-cols-[1fr_300px] gap-6">
            <div>
              <div className="flex gap-1 mb-4" role="tablist">
                {temps.map((t) => {
                  const n = t === "all" ? radar.data!.leads.length : radar.data!.leads.filter((l) => l.temperature === t).length;
                  return <button key={t} role="tab" aria-selected={filter === t} onClick={() => setFilter(t)} data-testid={`filter-${t}`}
                    className={"rounded-full px-3 py-1 text-sm capitalize border transition-colors " + (filter === t ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}>{t} <span className="font-mono text-xs opacity-60">{n}</span></button>;
                })}
              </div>
              {leads.length === 0 ? (
                <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">No leads here yet. Load demo data in Settings, or run the radar.</div>
              ) : (
                <ul className="space-y-3">
                  {leads.map((l) => (
                    <li key={l.id} className="rounded-lg border bg-card p-4" data-testid={`card-lead-${l.id}`}>
                      <div className="flex flex-wrap items-start gap-3">
                        <span className={"rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " + tempStyle[l.temperature]}>{l.temperature}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium" dir="auto">{l.fullName} <SampleBadge sample={l.sample} /></div>
                          <div className="text-sm text-muted-foreground" dir="auto">{l.title} · {l.companyName} · {l.country}</div>
                        </div>
                        <Link href={`/leads/${l.id}`} className="text-sm text-accent inline-flex items-center gap-1 hover:underline" data-testid={`link-lead-${l.id}`}>Open <ArrowRight className="h-3.5 w-3.5" /></Link>
                      </div>
                      <div className="mt-3"><Thermometer lead={l} /></div>
                      <div className="mt-2 text-xs text-muted-foreground">{l.signals.length} signals · {l.drafts.length} drafts</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <aside className="space-y-6">
              <form onSubmit={submit} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="font-display text-lg">Add a signal URL</div>
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full h-9 rounded-md border bg-card px-2 text-sm" data-testid="select-company">
                  <option value="">Choose company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="bg-card" data-testid="input-signal-url" />
                <Button type="submit" className="w-full" disabled={add.isPending || running} data-testid="button-add-signal">{add.isPending ? "Queuing" : "Analyse URL"}</Button>
              </form>
              <div className="rounded-lg border bg-card">
                <div className="px-4 py-3 border-b font-display text-lg">Tracked companies</div>
                <ul className="divide-y text-sm">
                  {companies.map((c) => (
                    <li key={c.id} className="px-4 py-2.5">
                      <div className="flex justify-between"><span dir="auto">{c.name}</span><span className="font-mono text-xs">{c.roleCount} roles</span></div>
                      <div className="text-xs text-muted-foreground">{c.country} · ATS: {c.atsProvider ? `${c.atsProvider}${c.atsSlug ? "/" + c.atsSlug : ""}` : "none"}{c.lastCheckedAt ? ` · checked ${new Date(c.lastCheckedAt).toLocaleString()}` : " · not checked"}</div>
                      {c.error && <div className="text-xs text-destructive">{c.error}</div>}
                    </li>
                  ))}
                  {companies.length === 0 && <li className="px-4 py-3 text-muted-foreground">No companies tracked.</li>}
                </ul>
              </div>
            </aside>
          </div>
        )}
    </div>
  );
}
