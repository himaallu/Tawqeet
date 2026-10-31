import { useListSignalLeads, getListSignalLeadsQueryKey, type User } from "@workspace/api-client-react";
import { ExternalLink, Quote } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, PageHeader, Restricted } from "@/components/states";
import { can } from "@/lib/roles";
import { apiErrorMessage } from "@/lib/api-error";

const safeDate = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? s : format(d, "d MMM yyyy"); };

export default function LeadsPage({ user }: { user: User }) {
  const perms = can(user);
  const q = useListSignalLeads({ query: { enabled: perms.viewSignals, queryKey: getListSignalLeadsQueryKey(), notifyOnChangeProps: "all" } });
  if (!perms.viewSignals) return <Restricted title="Leads are staff only">Client viewers cannot open leads.</Restricted>;
  return (
    <div className="rise max-w-5xl">
      <PageHeader eyebrow="Workspace" title="Leads">
        {q.data && <span className="rounded-md border bg-card px-3 py-1.5 font-mono text-sm" data-testid="text-lead-count">{q.data.length} leads</span>}
      </PageHeader>
      {q.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : q.isError || !q.data ? (
        <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center" data-testid="status-leads-empty">
          <div className="font-display text-xl">No scored leads yet</div>
          <p className="text-sm text-muted-foreground mt-1">Leads appear here once a signal is matched with evidence.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {q.data.map((l) => (
            <article key={l.id} className="rounded-lg border bg-card overflow-hidden" data-testid={`card-lead-${l.id}`}>
              <header className="flex flex-wrap items-center gap-4 px-5 py-4 border-b">
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-xl font-semibold" dir="auto" data-testid={`text-lead-name-${l.id}`}>{l.fullName}</h2>
                  <div className="text-sm text-muted-foreground"><span dir="auto">{l.companyName}</span> <span className="opacity-50">for</span> <span dir="auto">{l.clientName}</span></div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl tabular-nums" data-testid={`text-lead-score-${l.id}`}>{l.totalScore}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Score, <span data-testid={`text-lead-signal-points-${l.id}`}>{l.signalPoints}</span> from signals</div>
                </div>
              </header>
              {l.signals.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No matched signal evidence.</p>
              ) : (
                <ul className="divide-y">
                  {l.signals.map((s) => (
                    <li key={s.id} className="px-5 py-4 flex gap-4" data-testid={`evidence-${s.id}`}>
                      <span className={"font-mono text-sm tabular-nums w-12 shrink-0 " + (s.points < 0 ? "text-destructive" : "text-accent")}>{s.points > 0 ? "+" : ""}{s.points}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium" dir="auto">{s.name}</span>
                          <span className="text-sm text-muted-foreground" dir="auto">{s.title}</span>
                          <span className="font-mono text-[10px] text-muted-foreground ml-auto">{safeDate(s.detectedAt)}</span>
                        </div>
                        <blockquote className="mt-2 flex gap-2 text-sm border-s-2 border-accent/40 ps-3" dir="auto" data-testid={`text-evidence-quote-${s.id}`}>
                          <Quote className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />{s.evidenceQuote}
                        </blockquote>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline break-all" data-testid={`link-evidence-source-${s.id}`}>
                            <ExternalLink className="h-3 w-3" />{s.url}
                          </a>
                        ) : <span className="mt-2 block text-xs text-muted-foreground">No source link</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
