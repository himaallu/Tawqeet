import { useState } from "react";
import { useGetBrainLearnings, getGetBrainLearningsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";

const s = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

export function Learnings({ id, verticals }: { id: string; verticals: string[] }) {
  const [vertical, setVertical] = useState("");
  const params = vertical.trim() ? { vertical: vertical.trim() } : undefined;
  const q = useGetBrainLearnings(id, params, { query: { queryKey: getGetBrainLearningsQueryKey(id, params), staleTime: 30_000, refetchOnMount: true } });
  const rows = (q.data ?? []).slice(0, 50);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input dir="auto" value={vertical} onChange={(e) => setVertical(e.target.value)} placeholder="Filter by vertical" className="max-w-xs bg-card" data-testid="input-learning-vertical" />
        {verticals.map((v) => <button key={v} onClick={() => setVertical(vertical === v ? "" : v)} dir="auto" className={"rounded-sm border px-2 py-1 text-xs " + (vertical === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")} data-testid={"button-vertical-" + v}>{v}</button>)}
        <span className="text-xs text-muted-foreground font-mono ml-auto">last 50</span>
      </div>
      {q.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        : q.isError ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} />
        : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card/60 p-10 text-center" data-testid="status-empty-learnings">
            <h3 className="font-display text-xl">Nothing learned yet</h3>
            <p className="text-sm text-muted-foreground mt-2">Signals from replies will collect here once campaigns run{vertical && " for this vertical"}.</p>
          </div>
        ) : (
          <ul className="rounded-lg border bg-card divide-y" data-testid="list-learnings">
            {rows.map((l) => {
              const m = l.meta;
              const tags = [["vertical", m.vertical], ["persona", m.persona], ["lang", m.language], ["reply", m.reply_class], ["score", m.score], ["play", m.play_id], ["signal", m.signal_key]].filter(([, v]) => s(v));
              return (
                <li key={l.id} className="px-4 py-3" data-testid={"row-learning-" + l.id}>
                  {s(m.subject) && <p className="text-xs text-muted-foreground" dir="auto">Subject: {s(m.subject)}</p>}
                  <p className="text-sm" dir="auto">{l.content}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                    {tags.map(([k, v]) => <span key={k as string} dir="auto" className="rounded-sm bg-secondary px-1.5 py-0.5 text-[11px] font-mono">{k as string}: {s(v)}</span>)}
                    <span className="text-[11px] text-muted-foreground font-mono ml-auto">{format(new Date(l.createdAt), "d MMM yyyy")}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
