import { useGetReport, getGetReportQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorPanel, PageHeader } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";

export default function ReportsPage() {
  const q = useGetReport({ query: { queryKey: getGetReportQueryKey() } });
  return (
    <div className="rise max-w-4xl">
      <PageHeader eyebrow="Workspace" title="Client report" />
      {q.isLoading ? <Skeleton className="h-64" /> : q.isError || !q.data ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([["Emails sent", q.data.emailsSent], ["Replies", q.data.replies], ["Positive replies", q.data.positiveReplies], ["Positive per 100 sends", q.data.positivePer100]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-card p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div><div className="font-display text-3xl mt-1">{v}</div></div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {([["Top signals behind sends", q.data.topSignals], ["Best subjects (positive replies)", q.data.bestSubjects]] as const).map(([title, list]) => (
              <section key={title} className="rounded-lg border bg-card p-5">
                <h2 className="font-display text-lg mb-2">{title}</h2>
                {list.length === 0 ? <p className="text-sm text-muted-foreground">No data yet. Send and mark replies in Review & Send.</p> :
                  <ul className="space-y-1 text-sm">{list.map((x) => <li key={x.name} className="flex justify-between gap-3"><span dir="auto" className="truncate">{x.name}</span><span className="font-mono">{x.count}</span></li>)}</ul>}
              </section>
            ))}
          </div>
          <section>
            <h2 className="font-display text-2xl mb-1">Calibration</h2>
            <p className="text-sm text-muted-foreground mb-3">Lead score bucket at send time vs. observed reply rate. Small samples are noisy.</p>
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Score bucket</TableHead><TableHead className="text-right">Sends</TableHead><TableHead className="text-right">Replies</TableHead><TableHead className="text-right">Positive</TableHead><TableHead className="text-right">Reply rate</TableHead></TableRow></TableHeader>
                <TableBody>{q.data.calibration.map((b) => (
                  <TableRow key={b.bucket}><TableCell className="font-mono">{b.bucket}</TableCell><TableCell className="text-right font-mono">{b.sends}</TableCell>
                    <TableCell className="text-right font-mono">{b.replies}</TableCell><TableCell className="text-right font-mono">{b.positive}</TableCell>
                    <TableCell className="text-right font-mono">{b.replyRate}%</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
