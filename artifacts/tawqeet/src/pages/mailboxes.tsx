import { useState } from "react";
import { useGetMailboxStatus, getGetMailboxStatusQueryKey } from "@workspace/api-client-react";
import { Mail, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorPanel, PageHeader } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";

export default function MailboxesPage() {
  const q = useGetMailboxStatus({ query: { queryKey: getGetMailboxStatusQueryKey() } });
  const [clientId, setClientId] = useState<string>("");
  const params = new URLSearchParams(window.location.search);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const chosen = clientId || q.data?.clients[0]?.id || "";

  return (
    <div className="rise max-w-3xl">
      <PageHeader eyebrow="Settings" title="Mailboxes" />
      {params.get("connected") && <p className="mb-4 text-sm text-accent" role="status">Mailbox connected ({params.get("connected")}).</p>}
      {params.get("error") && <p className="mb-4 text-sm text-destructive" role="alert">Connection failed ({params.get("error")}). Check the client ID/secret and redirect URI, then try again.</p>}
      {q.isLoading ? <Skeleton className="h-48" /> : q.isError || !q.data ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <>
          <div className="mb-6 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm flex gap-2" data-testid="status-mailboxes">
            <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
            {q.data.realSend
              ? <span><span className="font-medium">REAL_SEND is on:</span> approved emails go to the actual lead through the client's connected mailbox (human approval, compliance checks and the daily cap still apply).</span>
              : <span><span className="font-medium">Demo mode:</span> approved emails are sent via Resend to the demo recipient only. Set REAL_SEND=true to send through connected mailboxes.</span>}
          </div>
          {!q.data.encryptionReady && <p className="mb-4 text-sm text-destructive">ENCRYPTION_KEY (64 hex characters) is required before connecting mailboxes.</p>}
          {q.data.clients.length > 1 && (
            <div className="mb-4 flex items-center gap-2 text-sm"><span className="text-muted-foreground">Connect for client</span>
              <Select value={chosen} onValueChange={setClientId}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>{q.data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          )}
          <div className="space-y-3">
            {q.data.providers.map((p) => (
              <div key={p.provider} className="rounded-lg border bg-card p-5" data-testid={`card-mailbox-${p.provider}`}>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <Mail className="h-5 w-5 text-accent" />
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <p className="text-sm text-muted-foreground">Send-only scope: Tawqeet can send as the mailbox but cannot read, list or delete email.</p>
                    <div className="font-mono text-[10px] uppercase text-muted-foreground mt-1">Scope: {p.scope} · daily cap 30 · {p.configured ? "configured" : "not configured"}</div>
                  </div>
                  {p.configured
                    ? <Button asChild data-testid={`button-connect-${p.provider}`}><a href={`${base}/api/mailboxes/oauth/${p.provider}/start?clientId=${encodeURIComponent(chosen)}`}>Connect {p.provider === "gmail" ? "Gmail" : "Outlook"}</a></Button>
                    : <Button variant="outline" disabled title={`Set ${p.provider === "gmail" ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET"} plus ENCRYPTION_KEY`} data-testid={`button-connect-${p.provider}`}>Connect {p.provider === "gmail" ? "Gmail" : "Outlook"}</Button>}
                </div>
                {p.redirectUri && <div className="mt-3 text-xs"><span className="text-muted-foreground">Redirect URI to register: </span><code className="font-mono break-all" data-testid={`redirect-${p.provider}`}>{p.redirectUri}</code></div>}
                {p.connections.map((c) => <div key={c.clientId} className="mt-2 text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" />{c.clientName}: {c.email}</div>)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
