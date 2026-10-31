import type { ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { getGetBrainQueryKey, getGetBrainLearningsQueryKey, getGetClientQueryKey, getListClientsQueryKey } from "@workspace/api-client-react";

export function invalidateBrain(qc: QueryClient, id: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: getGetBrainQueryKey(id) }),
    qc.invalidateQueries({ queryKey: getGetBrainLearningsQueryKey(id) }),
    qc.invalidateQueries({ queryKey: getGetClientQueryKey(id) }),
    qc.invalidateQueries({ queryKey: getListClientsQueryKey() }),
  ]);
}

export function Panel({ label, title, children, aside, testid }: { label: string; title?: ReactNode; children: ReactNode; aside?: ReactNode; testid?: string }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-5" data-testid={testid}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</h3>
          {title && <p className="font-display text-xl mt-1">{title}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function ConfigNote({ children, testid }: { children: ReactNode; testid: string }) {
  return <p className="text-xs rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-foreground/80" data-testid={testid}>{children}</p>;
}

export function ImportResultView({ r, testid }: { r: { message: string; imported: number; skipped: number; warnings: string[] }; testid: string }) {
  return (
    <div className="rounded-md border bg-secondary/40 p-3 text-sm space-y-1" data-testid={testid}>
      <p dir="auto">{r.message}</p>
      <p className="font-mono text-xs text-muted-foreground">{r.imported} imported / {r.skipped} skipped</p>
      {r.warnings.length > 0 && <ul className="text-xs text-destructive list-disc pl-4">{r.warnings.slice(0, 8).map((w, i) => <li key={i} dir="auto">{w}</li>)}</ul>}
    </div>
  );
}
