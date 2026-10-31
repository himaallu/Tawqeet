import { useGetLiveServiceChecks, getGetLiveServiceChecksQueryKey } from "@workspace/api-client-react";
import { CheckCircle2, XCircle, CircleDashed, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";

const style = { pass: "text-[hsl(160_45%_36%)]", fail: "text-destructive", skip: "text-muted-foreground" } as const;
const icons = { pass: CheckCircle2, fail: XCircle, skip: CircleDashed } as const;

/** Live minimal calls to each configured service. Shows PASS / FAIL / SKIP, never values. */
export function LiveChecks() {
  const q = useGetLiveServiceChecks({ query: { queryKey: getGetLiveServiceChecksQueryKey(), enabled: false } });
  return (
    <section className="rounded-lg border bg-card overflow-hidden mb-6" data-testid="panel-live-checks">
      <div className="px-5 py-3 border-b flex items-center gap-3 bg-secondary/40">
        <h2 className="font-display text-lg flex-1">Live service checks</h2>
        <Button size="sm" variant="outline" disabled={q.isFetching} onClick={() => q.refetch()} data-testid="button-live-checks"><Zap className="h-3.5 w-3.5 mr-1.5" />{q.isFetching ? "Checking" : "Run live checks"}</Button>
      </div>
      {q.isError && <p className="px-5 py-3 text-sm text-destructive">{apiErrorMessage(q.error)}</p>}
      {!q.data ? <p className="px-5 py-3 text-sm text-muted-foreground">Makes a minimal call to each configured service (database, AI, Gemini, LeadOcean, Resend, webhook, Stripe link, HubSpot, Firecrawl, Trello, Twilio, Asana, ClickUp). No email or webhook is sent from here; <span className="font-mono">pnpm run check:env</span> sends those tests.</p> : (
        <ul>
          {q.data.missingRequired.length > 0 && <li className="px-5 py-3 border-b text-sm text-destructive">Missing required: {q.data.missingRequired.join(", ")}</li>}
          {q.data.checks.map((c) => { const Icon = icons[c.status]; return (
            <li key={c.key} className="flex gap-3 px-5 py-2.5 border-b last:border-0 text-sm" data-testid={`live-${c.key}`}>
              <Icon className={"h-4 w-4 mt-0.5 shrink-0 " + style[c.status]} />
              <span className="font-medium w-48 shrink-0">{c.label}</span>
              <span className="text-muted-foreground flex-1 break-words">{c.detail}</span>
              <span className={"font-mono text-[10px] uppercase " + style[c.status]}>{c.status}</span>
            </li>
          ); })}
        </ul>
      )}
    </section>
  );
}
