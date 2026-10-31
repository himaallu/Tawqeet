import { useGetBilling, getGetBillingQueryKey } from "@workspace/api-client-react";
import { ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, PageHeader } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";

export default function BillingPage() {
  const q = useGetBilling({ query: { queryKey: getGetBillingQueryKey() } });
  return (
    <div className="rise max-w-4xl">
      <PageHeader eyebrow="Settings" title="Billing" />
      {q.isLoading ? <Skeleton className="h-64" /> : q.isError || !q.data ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} /> : (() => {
        const b = q.data;
        const stats: [string, string | number][] = [["Client workspaces", `${b.clients} / ${b.includedClients} included`], ["Drafts generated", b.draftsGenerated],
          ["Simulations run", b.simulationsRun], ["AI calls", b.aiCalls], ["AI cost", b.aiCostUsd === null ? "Pricing not configured" : `USD ${b.aiCostUsd.toFixed(2)}`], ["Emails sent", b.emailsSent]];
        return (
          <div className="space-y-6">
            <section className="rounded-lg border bg-card p-6 flex flex-col md:flex-row gap-6 md:items-center">
              <div className="flex-1">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{b.plan} plan</div>
                <div className="font-display text-4xl mt-1">USD {b.priceUsd}<span className="text-base text-muted-foreground">/month</span></div>
                <ul className="mt-3 text-sm space-y-1">
                  <li className="flex gap-2"><Check className="h-4 w-4 text-accent" />{b.includedClients} client workspaces included</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-accent" />+USD {b.extraClientUsd} per extra client</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-accent" />Signal radar, simulated inbox, Hot-lead alerts</li>
                </ul>
              </div>
              <div className="md:text-right">
                <div className="text-sm text-muted-foreground">Estimated this month</div>
                <div className="font-display text-3xl" data-testid="text-billing-total">USD {b.monthlyTotalUsd}</div>
                {b.extraClients > 0 && <div className="text-xs text-muted-foreground">{b.extraClients} extra client{b.extraClients > 1 ? "s" : ""} × USD {b.extraClientUsd}</div>}
                {b.paymentLink ? (
                  <Button asChild className="mt-3 bg-accent text-accent-foreground hover:bg-accent/90" data-testid="button-upgrade">
                    <a href={b.paymentLink} target="_blank" rel="noreferrer">Upgrade <ExternalLink className="h-4 w-4 ml-2" /></a>
                  </Button>
                ) : <p className="mt-3 text-xs text-muted-foreground max-w-[220px] md:ml-auto" data-testid="text-upgrade-unset">Upgrade is unavailable: set STRIPE_PAYMENT_LINK to enable checkout.</p>}
              </div>
            </section>
            <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {stats.map(([k, v]) => (
                <div key={k} className="rounded-lg border bg-card p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div><div className="font-display text-2xl mt-1">{v}</div></div>
              ))}
            </section>
          </div>
        );
      })()}
    </div>
  );
}
