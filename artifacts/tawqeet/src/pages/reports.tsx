import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetReport, getGetReportQueryKey, useCreateReportShareLink, useUpdateAbTest, type ReportBucket } from "@workspace/api-client-react";
import { Link2, Copy } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorPanel, PageHeader } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

function BucketTable({ rows, label }: { rows: ReportBucket[]; label: string }) {
  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>{label}</TableHead><TableHead className="text-right">Sends</TableHead><TableHead className="text-right">Replies</TableHead><TableHead className="text-right">Positive</TableHead><TableHead className="text-right">Reply rate</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((b) => (
          <TableRow key={b.bucket}><TableCell className="font-mono">{b.bucket}</TableCell><TableCell className="text-right font-mono">{b.sends}</TableCell>
            <TableCell className="text-right font-mono">{b.replies}</TableCell><TableCell className="text-right font-mono">{b.positive}</TableCell>
            <TableCell className="text-right font-mono">{b.replyRate}%</TableCell></TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string>("all");
  const params = clientId === "all" ? undefined : { clientId };
  const q = useGetReport(params, { query: { queryKey: getGetReportQueryKey(params) } });
  const share = useCreateReportShareLink();
  const ab = useUpdateAbTest();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const r = q.data;
  const readOnly = !!r?.readOnly;

  return (
    <div className="rise max-w-5xl">
      <PageHeader eyebrow={readOnly ? "Read-only client view" : "Workspace"} title={r?.clientName ? `${r.clientName} report` : "Client report"}>
        {r && !readOnly && (
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setShareUrl(null); }}>
            <SelectTrigger className="w-56" data-testid="select-report-client"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {r.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {r && !readOnly && (
          <Button variant="outline" disabled={clientId === "all" || share.isPending} title={clientId === "all" ? "Choose a client first" : undefined} data-testid="button-share-report"
            onClick={() => share.mutate({ data: { clientId } }, {
              onSuccess: (s) => setShareUrl(s.url),
              onError: (e) => toast({ title: "Could not create link", description: apiErrorMessage(e), variant: "destructive" }),
            })}><Link2 className="h-4 w-4 mr-2" />Share read-only link</Button>
        )}
      </PageHeader>
      {shareUrl && (
        <div className="mb-6 rounded-md border bg-card p-3 flex gap-2 items-center" data-testid="panel-share-link">
          <Input readOnly value={shareUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(shareUrl).then(() => toast({ title: "Link copied" }), () => undefined); }}><Copy className="h-4 w-4" /></Button>
          <span className="text-xs text-muted-foreground whitespace-nowrap">Valid 7 days · client sees only this report</span>
        </div>
      )}
      {q.isLoading ? <Skeleton className="h-64" /> : q.isError || !r ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([["Emails sent", r.emailsSent], ["Replies", r.replies], ["Positive replies", r.positiveReplies], ["Positive per 100 sends", r.positivePer100]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-card p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div><div className="font-display text-3xl mt-1">{v}</div></div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {([["Top signals behind sends", r.topSignals], ["Best subjects (positive replies)", r.bestSubjects]] as const).map(([title, list]) => (
              <section key={title} className="rounded-lg border bg-card p-5">
                <h2 className="font-display text-lg mb-2">{title}</h2>
                {list.length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> :
                  <ul className="space-y-1 text-sm">{list.map((x) => <li key={x.name} className="flex justify-between gap-3"><span dir="auto" className="truncate">{x.name}</span><span className="font-mono">{x.count}</span></li>)}</ul>}
              </section>
            ))}
          </div>

          <section>
            <h2 className="font-display text-2xl mb-3">Sent emails</h2>
            {r.sentEmails.length === 0 ? <p className="text-sm text-muted-foreground">No emails sent yet.</p> : (
              <ul className="space-y-3">
                {r.sentEmails.map((e) => (
                  <li key={e.id} className="rounded-lg border bg-card p-4" data-testid={`sent-${e.id}`}>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-mono">
                      <span>{format(new Date(e.sentAt), "d MMM yyyy HH:mm")}</span><span>· {e.companyName}</span><span dir="auto">· {e.leadName}</span>
                      {e.replyClass && <span className="text-accent">· reply: {e.replyClass}</span>}{e.abArm && <span>· A/B {e.abArm}</span>}
                    </div>
                    <div className="font-medium mt-1" dir="auto">{e.subject}</div>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground mt-1 line-clamp-4" dir="auto">{e.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!readOnly && (
            <>
              <section>
                <h2 className="font-display text-2xl mb-1">Calibration</h2>
                <p className="text-sm text-muted-foreground mb-3">Lead score bucket at send time vs. observed reply rate. Small samples are noisy.</p>
                <BucketTable rows={r.calibration} label="Score bucket" />
              </section>
              <section>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="font-display text-2xl">A/B test</h2>
                  <Switch checked={r.abEnabled} disabled={ab.isPending} aria-label="A/B test" data-testid="switch-ab"
                    onCheckedChange={(enabled) => ab.mutate({ data: { enabled } }, {
                      onSuccess: (m) => { toast({ title: m.message }); qc.invalidateQueries({ queryKey: getGetReportQueryKey(params) }); },
                    })} />
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">{r.abEnabled ? "On" : "Off"}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">When on, 10% of approvals of the best-scored variant send the second-best variant instead, so the simulation score can be checked against real replies.</p>
                <BucketTable rows={r.abArms} label="Arm" />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
