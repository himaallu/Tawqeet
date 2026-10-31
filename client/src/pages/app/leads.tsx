import { Search, Users } from "lucide-react";
import * as React from "react";
import { HeatBar, SignalChip } from "@/components/heat";
import { LeadPanel } from "@/components/lead-panel";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Empty, Skeleton, Table, Td, Th, Tooltip } from "@/components/ui/misc";
import { useApi, type Lead, type Temperature } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn, FLAG, timeAgo } from "@/lib/utils";

const STATUS_TONE: Record<string, "neutral" | "warm" | "hot" | "good" | "outline"> = { new: "outline", drafted: "neutral", ready: "hot", sent: "good", replied: "good", closed: "neutral" };

export function LeadsPage() {
  const { clientId, client } = useSession();
  const [temps, setTemps] = React.useState<Temperature[]>([]);
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const params = new URLSearchParams();
  if (clientId) params.set("clientId", clientId);
  if (temps.length) params.set("temperature", temps.join(","));
  if (status) params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const leads = useApi<Lead[]>(["leads", params.toString()], `/leads?${params}`, { placeholderData: (p) => p });
  const toggle = (t: Temperature) => setTemps((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <>
      <PageHeader eyebrow={client?.name ?? "All clients"} title="Leads" description="Everyone the radar found, ranked by thermometer. Hot ≥ 70 · Warm 40–69 · Cold < 40." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["hot", "warm", "cold"] as const).map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium capitalize transition", temps.includes(t) ? "border-ink/30 bg-surface shadow-card" : "border-line text-ink-2 hover:bg-surface")}
          >
            <span className="size-2 rounded-full" style={{ background: `var(--${t})` }} /> {t}
          </button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded-lg border bg-surface px-2.5 text-[12.5px] text-ink-2">
          <option value="">Any status</option>
          {["new", "drafted", "ready", "sent", "replied", "closed"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="relative ms-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, title" className="h-8 ps-8" />
        </div>
      </div>
      {leads.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : !leads.data?.length ? (
        <Empty icon={<Users />} title="No leads match">Leads are created when a signal matches a client's ICP and the account turns warm or hot.</Empty>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Heat</Th>
                <Th>Person</Th>
                <Th>Company</Th>
                <Th className="hidden lg:table-cell">Signals</Th>
                {!clientId && <Th className="hidden md:table-cell">Client</Th>}
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {leads.data.map((l) => (
                <tr key={l.id} onClick={() => setOpen(l.id)} className="cursor-pointer hover:bg-surface-2/70">
                  <Td>
                    <Tooltip content={l.breakdown ? `Signals ${Math.round(l.breakdown.signalPoints)} · stack ${l.breakdown.stackBonus} · fit ${l.breakdown.fitPoints} · engagement ${l.breakdown.engagement}` : "No score yet"}>
                      <span><HeatBar score={l.tempScore} temperature={l.temperature} /></span>
                    </Tooltip>
                  </Td>
                  <Td>
                    <div dir="auto" className="font-medium">{l.fullName}</div>
                    <div dir="auto" className="text-[12px] text-ink-3">{l.title}</div>
                  </Td>
                  <Td>
                    <div className="font-medium">{l.company.name} {FLAG[l.company.country ?? ""]}</div>
                    <div className="text-[12px] text-ink-3">{[l.company.vertical, l.company.sizeBand].filter(Boolean).join(" · ")}</div>
                  </Td>
                  <Td className="hidden max-w-72 lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {l.signals.slice(0, 3).map((s) => (
                        <SignalChip key={s.id} s={s} compact />
                      ))}
                    </div>
                  </Td>
                  {!clientId && <Td className="hidden text-[12.5px] text-ink-2 md:table-cell">{l.clientName}</Td>}
                  <Td>
                    <Badge tone={STATUS_TONE[l.status]}>{l.status}</Badge>
                  </Td>
                  <Td className="hidden text-[12px] text-ink-3 md:table-cell">{timeAgo(l.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <LeadPanel leadId={open} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}
