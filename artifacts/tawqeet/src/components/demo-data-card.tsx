import { useLoadDemoData } from "@workspace/api-client-react";
import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoStatus, useKickStatus } from "@/hooks/use-demo";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

export function DemoDataCard() {
  const status = useDemoStatus();
  const kick = useKickStatus();
  const { toast } = useToast();
  const load = useLoadDemoData();
  const s = status.data;
  if (!s?.enabled) return null;
  return (
    <section className="rounded-lg border bg-card p-6 mt-6" data-testid="section-demo-data">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <Database className="h-6 w-6 text-accent" />
        <div className="flex-1">
          <h2 className="font-display text-xl">Demo data</h2>
          <p className="text-sm text-muted-foreground mt-1">Seeds a client brain, approved illustrative cases, 16 sample contacts with source evidence and 3 drafts per lead. Shared workspace; no emails are sent.</p>
          <div className="text-xs font-mono mt-2" data-testid="text-demo-status">
            {s.running ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />{s.stage}</span> : s.loaded ? "Loaded" : "Not loaded"} · Gemini {s.geminiConfigured ? "configured" : "not configured (sample mode)"}
          </div>
          {s.error && <p className="text-sm text-destructive mt-1">{s.error}</p>}
          {s.warnings.map((w, i) => <p key={i} className="text-xs text-muted-foreground">{w}</p>)}
        </div>
        <Button disabled={s.running || load.isPending} data-testid="button-load-demo"
          onClick={() => load.mutate(undefined, { onSuccess: () => { kick(); toast({ title: "Loading demo data" }); }, onError: (e) => toast({ title: "Could not load demo data", description: apiErrorMessage(e), variant: "destructive" }) })}>
          {s.running ? "Running" : s.loaded ? "Reload demo data" : "Load demo data"}
        </Button>
      </div>
    </section>
  );
}
