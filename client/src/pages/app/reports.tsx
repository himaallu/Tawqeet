import { FileText, Printer } from "lucide-react";
import { Link } from "wouter";
import { PageHeader, Stat } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Empty, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

type Report = {
  agency: string;
  client: { id: string; name: string };
  period: { from: string; to: string };
  sent: number;
  replies: number;
  positive: number;
  positivePer100: number;
  meetings: number;
  topSignals: { name: string; count: number }[];
  bestPlays: { name: string; sent: number; positive: number }[];
};

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function ReportsPage() {
  const { clientId, clients, isStaff } = useSession();
  const id = clientId ?? clients[0]?.id ?? null;
  const q = useApi<Report>(["report", id], id ? `/clients/${id}/report` : null);
  if (!id) return <Empty icon={<FileText />} title="No clients yet" action={isStaff && <Button variant="primary" asChild><Link href="/settings/clients?new=1">Add client</Link></Button>} />;
  const r = q.data;
  const max = Math.max(1, ...(r?.topSignals.map((s) => s.count) ?? [1]));

  return (
    <>
      <div className="no-print">
        <PageHeader
          eyebrow="Weekly report"
          title={r?.client.name ?? " "}
          description="White-label: sent to the client's viewers each week under your agency's name."
          actions={<Button onClick={() => window.print()}><Printer /> Print / PDF</Button>}
        />
      </div>
      {!r ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-end justify-between border-b pb-4">
            <div>
              <div className="text-[13px] font-semibold">{r.agency}</div>
              <div className="text-[22px] font-semibold tracking-tight">{r.client.name} · outbound report</div>
            </div>
            <div className="text-end text-[12.5px] text-ink-3">{fmt(r.period.from)} – {fmt(r.period.to)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Emails sent" value={r.sent} />
            <Stat label="Replies" value={r.replies} />
            <Stat label="Positive / 100 sends" value={r.positivePer100} accent="good" />
            <Stat label="Meetings" value={r.meetings} accent="hot" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Top signals" description="What triggered the emails sent" />
              <CardBody className="grid gap-2.5">
                {r.topSignals.length === 0 && <p className="text-[13px] text-ink-3">No sends this week.</p>}
                {r.topSignals.map((s) => (
                  <div key={s.name} className="grid gap-1">
                    <div className="flex justify-between text-[13px]"><span>{s.name}</span><span className="num text-ink-3">{s.count}</span></div>
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-hot" style={{ width: `${(s.count / max) * 100}%` }} /></span>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Best plays" description="Positive replies / sends" />
              <CardBody className="grid gap-2">
                {r.bestPlays.length === 0 && <p className="text-[13px] text-ink-3">No plays used this week.</p>}
                {r.bestPlays.map((p) => (
                  <div key={p.name} className="flex justify-between text-[13px]">
                    <span>{p.name}</span>
                    <span className="num text-ink-2">{p.positive}/{p.sent}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
