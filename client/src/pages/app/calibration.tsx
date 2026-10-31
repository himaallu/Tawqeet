import { Gauge } from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Stat } from "@/components/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Empty, Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { useApi } from "@/lib/api";
import { useClientQuery, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Bucket = { bucket: string; sent: number; replies: number; positive: number; replyRate: number | null };
type Cal = { table: { vertical: string; buckets: Bucket[] }[]; ab: { group: string; label: string; sent: number; replies: number; replyRate: number | null }[]; total: number };

function BucketTooltip({ active, payload }: { active?: boolean; payload?: { payload: Bucket }[] }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-lg border bg-surface px-3 py-2 text-[12px] shadow-pop">
      <div className="font-semibold">Score {b.bucket}</div>
      <div className="text-ink-2">{b.replyRate === null ? "No sends yet" : `${b.replyRate}% reply rate`}</div>
      <div className="text-ink-3">{b.replies} replies / {b.sent} sent · {b.positive} positive</div>
    </div>
  );
}

export function CalibrationPage() {
  const { client } = useSession();
  const qs = useClientQuery();
  const q = useApi<Cal>(["calibration", qs], `/calibration${qs}`);
  const [vertical, setVertical] = React.useState("All");
  const d = q.data;
  const row = d?.table.find((t) => t.vertical === vertical) ?? d?.table[0];
  const data = (row?.buckets ?? []).map((b) => ({ ...b, rate: b.replyRate ?? 0 }));
  const [control, challenger] = d?.ab ?? [];

  return (
    <>
      <PageHeader
        eyebrow={client?.name ?? "All clients"}
        title="Calibration"
        description="Does the simulated score predict real replies? Every send logs its score; this compares them with what actually happened."
      />
      {!d ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : d.total === 0 ? (
        <Empty icon={<Gauge />} title="No sends to calibrate yet">Once emails go out and replies come back, reply rate by score bucket appears here.</Empty>
      ) : (
        <div className="grid min-w-0 gap-4">
          <Card className="min-w-0">
            <CardHeader
              title="Reply rate by simulated score"
              description={`${d.total} sends · a well-calibrated score rises left to right`}
              action={
                <div className="flex flex-wrap gap-1">
                  {d.table.map((t) => (
                    <button key={t.vertical} onClick={() => setVertical(t.vertical)} className={cn("h-7 rounded-md px-2.5 text-[12px] font-medium transition", (row?.vertical ?? "All") === t.vertical ? "bg-primary text-primary-ink" : "bg-surface-3/70 text-ink-2 hover:text-ink")}>
                      {t.vertical}
                    </button>
                  ))}
                </div>
              }
            />
            <CardBody>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 12 }} unit="%" allowDecimals={false} />
                    <RTooltip content={<BucketTooltip />} cursor={{ fill: "var(--surface-3)", opacity: 0.6 }} />
                    <Bar dataKey="rate" fill="var(--hot)" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table className="mt-4">
                <thead>
                  <tr>
                    <Th>Score</Th>
                    <Th className="text-end">Sent</Th>
                    <Th className="text-end">Replies</Th>
                    <Th className="text-end">Positive</Th>
                    <Th className="text-end">Reply rate</Th>
                  </tr>
                </thead>
                <tbody>
                  {row?.buckets.map((b) => (
                    <tr key={b.bucket}>
                      <Td className="num">{b.bucket}</Td>
                      <Td className="num text-end">{b.sent}</Td>
                      <Td className="num text-end">{b.replies}</Td>
                      <Td className="num text-end">{b.positive}</Td>
                      <Td className="num text-end font-semibold">{b.replyRate === null ? "—" : `${b.replyRate}%`}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {control && <Stat label={control.label} value={control.replyRate === null ? "—" : `${control.replyRate}%`} sub={`${control.replies} replies from ${control.sent} sends`} />}
            {challenger && <Stat label={challenger.label} value={challenger.replyRate === null ? "—" : `${challenger.replyRate}%`} sub={`${challenger.replies} replies from ${challenger.sent} sends`} />}
          </div>
          <p className="text-[12px] text-ink-3">A/B: 10% of leads are presented the second-best variant. If it replies as well as the winner, the score is over-confident.</p>
        </div>
      )}
    </>
  );
}
