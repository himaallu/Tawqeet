import { AlertTriangle, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function ErrorPanel({ title = "Could not load", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rise rounded-md border border-destructive/30 bg-destructive/5 p-5 flex gap-4 items-start" data-testid="status-error">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
      </div>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry"><RotateCw className="h-3.5 w-3.5 mr-1.5" />Retry</Button>}
    </div>
  );
}

export function Restricted({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rise mx-auto max-w-lg mt-16 rounded-lg border bg-card p-8 text-center" data-testid="status-restricted">
      <div className="mx-auto h-12 w-12 rounded-full bg-secondary grid place-items-center"><Lock className="h-5 w-5 text-primary" /></div>
      <h2 className="font-display text-2xl mt-4">{title}</h2>
      <div className="text-sm text-muted-foreground mt-2 leading-relaxed">{children}</div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between pb-6 border-b mb-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{eyebrow}</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold mt-1.5">{title}</h1>
      </div>
      {children && <div className="flex gap-2 flex-wrap">{children}</div>}
    </div>
  );
}
