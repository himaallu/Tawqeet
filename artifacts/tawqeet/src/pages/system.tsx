import { useGetSystemCheck, useHealthCheck, getGetSystemCheckQueryKey, getHealthCheckQueryKey, type User, type ConfigCheck } from "@workspace/api-client-react";
import { RotateCw, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, Restricted, PageHeader } from "@/components/states";
import { can } from "@/lib/roles";
import { LiveChecks } from "@/components/live-checks";
import { apiErrorMessage } from "@/lib/api-error";

const cats: { key: ConfigCheck["category"]; label: string; note: string }[] = [
  { key: "core", label: "Core", note: "Database and session essentials" },
  { key: "email", label: "Email", note: "Magic-link sign-in sender" },
  { key: "ai", label: "AI", note: "Model providers for upcoming features" },
  { key: "optional", label: "Optional", note: "Missing items here do not block the foundation" },
];

export default function SystemPage({ user }: { user: User }) {
  const allowed = can(user).systemChecks;
  const sys = useGetSystemCheck({ query: { enabled: allowed, queryKey: getGetSystemCheckQueryKey() } });
  const health = useHealthCheck({ query: { enabled: allowed, queryKey: getHealthCheckQueryKey() } });

  if (!allowed) return <Restricted title="Owner only">Server configuration checks are visible to the agency owner.</Restricted>;

  const checks = sys.data?.checks ?? [];
  const blocking = checks.filter((c) => c.required && !c.ok).length;
  const refresh = () => { sys.refetch(); health.refetch(); };

  return (
    <div className="rise max-w-4xl">
      <PageHeader eyebrow="Settings / System" title="Server configuration">
        <Button variant="outline" onClick={refresh} disabled={sys.isFetching} data-testid="button-refresh-checks"><RotateCw className={"h-4 w-4 mr-1.5 " + (sys.isFetching ? "animate-spin" : "")} />Refresh</Button>
      </PageHeader>

      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2" data-testid="status-api-health">
          <span className={"h-2 w-2 rounded-full " + (health.isLoading ? "bg-muted-foreground" : health.isError ? "bg-destructive" : "bg-[hsl(160_45%_36%)]")} />
          API {health.isLoading ? "checking" : health.isError ? "unreachable" : health.data?.status ?? "ok"}
        </div>
        {sys.data && <div className={"rounded-md px-3 py-2 border " + (blocking ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-[hsl(160_45%_36%/.3)] bg-[hsl(160_45%_36%/.07)] text-[hsl(160_45%_28%)]")} data-testid="status-summary">
          {blocking ? blocking + " required check" + (blocking > 1 ? "s" : "") + " failing" : "All required checks pass"}
        </div>}
        {sys.data && <div className="px-3 py-2 font-mono text-xs text-muted-foreground self-center">Checked {format(new Date(sys.data.checkedAt), "d MMM yyyy, HH:mm:ss")}</div>}
      </div>

      <LiveChecks />
      {sys.isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : sys.isError ? <ErrorPanel message={apiErrorMessage(sys.error)} onRetry={refresh} />
        : checks.length === 0 ? <p className="text-sm text-muted-foreground">The server returned no checks.</p>
        : (
          <div className="space-y-5">
            {cats.map((cat) => {
              const items = checks.filter((c) => c.category === cat.key);
              if (!items.length) return null;
              return (
                <section key={cat.key} className="rounded-lg border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b flex items-baseline justify-between gap-3 bg-secondary/40">
                    <h2 className="font-display text-lg">{cat.label}</h2><span className="text-xs text-muted-foreground">{cat.note}</span>
                  </div>
                  <ul>
                    {items.map((c) => {
                      const Icon = c.ok ? CheckCircle2 : c.required ? XCircle : CircleDashed;
                      return (
                        <li key={c.key} className="flex gap-3 px-5 py-3 border-b last:border-0" data-testid={"check-" + c.key}>
                          <Icon className={"h-5 w-5 shrink-0 mt-0.5 " + (c.ok ? "text-[hsl(160_45%_36%)]" : c.required ? "text-destructive" : "text-muted-foreground")} aria-label={c.ok ? "Passing" : "Failing"} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{c.label}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">{c.key}</span>
                              <span className={"rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " + (c.required ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{c.required ? "Required" : "Optional"}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5 break-words">{c.detail}</p>
                            {!c.ok && !c.required && <p className="text-xs text-muted-foreground mt-1 italic">Not configured. This does not block the foundation.</p>}
                          </div>
                          <span className={"self-start rounded-sm px-2 py-0.5 text-xs font-medium " + (c.ok ? "bg-[hsl(160_45%_36%/.12)] text-[hsl(160_45%_28%)]" : "bg-destructive/10 text-destructive")}>{c.ok ? "OK" : "Missing"}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
    </div>
  );
}
