import { useQueryClient } from "@tanstack/react-query";
import { useGetAlertSettings, getGetAlertSettingsQueryKey, useSendTestAlert, useSendDigestNow, type TestAlertInputChannel } from "@workspace/api-client-react";
import { BellRing, Mail, MessageSquare, Trello, ListChecks, CheckSquare, Webhook } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorPanel, PageHeader } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

const icons = { email: Mail, sms: MessageSquare, trello: Trello, asana: ListChecks, clickup: CheckSquare, webhook: Webhook } as const;

export default function AlertsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetAlertSettings({ query: { queryKey: getGetAlertSettingsQueryKey() } });
  const test = useSendTestAlert();
  const digest = useSendDigestNow();
  const sendDigest = (kind: "warm" | "cold") => digest.mutate({ data: { kind } }, {
    onSuccess: (r) => { toast({ title: kind === "warm" ? "Warm digest" : "Cold weekly summary", description: r.message }); qc.invalidateQueries({ queryKey: getGetAlertSettingsQueryKey() }); },
    onError: (e) => toast({ title: "Digest failed", description: apiErrorMessage(e), variant: "destructive" }),
  });
  const fire = (channel: TestAlertInputChannel) => test.mutate({ data: { channel } }, {
    onSuccess: (r) => { toast({ title: "Test alert", description: r.message }); qc.invalidateQueries({ queryKey: getGetAlertSettingsQueryKey() }); },
    onError: (e) => toast({ title: "Test failed", description: apiErrorMessage(e), variant: "destructive" }),
  });
  return (
    <div className="rise">
      <PageHeader eyebrow="Settings" title="Alerts" />
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">When a lead turns Hot (score 70+), Tawqeet emails the alert recipient and POSTs the lead to your Make webhook, which fans out to Trello, SMS, Asana or ClickUp. The same lead is not re-alerted within 7 days unless its score rises by 15 or more.</p>
      {q.isLoading ? <Skeleton className="h-64" /> : q.isError || !q.data ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
            {q.data.channels.map((c) => {
              const Icon = icons[c.key];
              return (
                <div key={c.key} className="rounded-lg border bg-card p-4 flex flex-col gap-3" data-testid={`card-channel-${c.key}`}>
                  <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-accent" /><span className="font-medium">{c.name}</span>
                    <span className={"ml-auto rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase " + (c.live ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground")}>{c.status}</span></div>
                  <p className="text-xs text-muted-foreground flex-1">{c.detail}</p>
                  <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => fire(c.key)} data-testid={`button-test-${c.key}`}>
                    <BellRing className="h-3.5 w-3.5 mr-1.5" />Send test alert
                  </Button>
                </div>
              );
            })}
          </div>
          <section className="rounded-lg border bg-card p-5 mb-10 flex flex-col md:flex-row md:items-center gap-4" data-testid="panel-digests">
            <div className="flex-1">
              <h2 className="font-display text-xl">Digests</h2>
              <p className="text-sm text-muted-foreground mt-1">Warm digest: 08:30 Gulf time every workday (Mon–Fri), one email listing new Warm leads. Cold watchlist: 08:30 on the first workday of the week (Monday). Sent by the worker to the alert email recipient.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={digest.isPending} onClick={() => sendDigest("warm")} data-testid="button-digest-warm">Send Warm digest now</Button>
              <Button variant="outline" disabled={digest.isPending} onClick={() => sendDigest("cold")} data-testid="button-digest-cold">Send Cold summary now</Button>
            </div>
          </section>
          <h2 className="font-display text-2xl mb-3">Alert log</h2>
          {q.data.log.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No alerts yet. Load demo data or send a test alert.</div> : (
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Lead</TableHead><TableHead>Channel</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
                <TableBody>
                  {q.data.log.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{format(new Date(a.createdAt), "d MMM HH:mm")}</TableCell>
                      <TableCell dir="auto">{a.leadName ?? "—"}{a.companyName ? <span className="text-muted-foreground"> · {a.companyName}</span> : null}{a.test && <span className="ml-1 font-mono text-[10px] uppercase text-accent">test</span>}</TableCell>
                      <TableCell className="capitalize">{a.channel}</TableCell>
                      <TableCell className="font-mono">{a.score ?? "—"}</TableCell>
                      <TableCell><span className={a.status === "sent" ? "text-accent" : a.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{a.status}</span></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={a.error ?? ""}>{a.error ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
