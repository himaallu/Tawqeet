import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSessionQueryKey } from "@workspace/api-client-react";
import { KeyRound, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand";

function readToken(): string | null {
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return null;
  const p = new URLSearchParams(h);
  return p.get("token") || (h.includes("=") ? null : h) || null;
}

export default function ConfirmPage() {
  const token = useMemo(readToken, []);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This link is missing its sign-in token. It may have been copied incompletely.");

  const go = async () => {
    if (!token) return;
    setPending(true); setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = body && typeof body === "object" ? (body.message || body.error) : null;
        throw new Error(msg || (res.status === 400 || res.status === 401 || res.status === 410 ? "This link has expired or was already used." : "Sign-in failed (" + res.status + ")."));
      }
      window.history.replaceState(null, "", window.location.pathname);
      await qc.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      setLocation("/clients", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setPending(false);
    }
  };

  return (
    <div className="min-h-[100dvh] grid place-items-center px-6 relative">
      <div className="absolute inset-0 girih opacity-25 pointer-events-none" />
      <div className="relative w-full max-w-md rounded-lg border bg-card p-8 shadow-[0_30px_60px_-30px_hsl(var(--primary)/.35)] rise">
        <Wordmark />
        {error ? (
          <div data-testid="status-confirm-error">
            <div className="mt-8 h-11 w-11 rounded-full bg-destructive/10 grid place-items-center"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
            <h1 className="font-display text-2xl mt-4">Link not accepted</h1>
            <p role="alert" className="text-sm text-muted-foreground mt-2">{error}</p>
            <p className="text-sm text-muted-foreground mt-2">Sign-in links expire quickly and work once. Request a fresh one.</p>
            <div className="mt-6 flex gap-2">
              <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => { window.history.replaceState(null, "", window.location.pathname); setLocation("/login"); }} data-testid="button-request-new-link">Request a new link</Button>
              {token && <Button variant="outline" onClick={go} disabled={pending} data-testid="button-retry-confirm">Retry</Button>}
            </div>
          </div>
        ) : (
          <div>
            <div className="mt-8 h-11 w-11 rounded-full bg-accent/15 grid place-items-center"><KeyRound className="h-5 w-5 text-accent" /></div>
            <h1 className="font-display text-2xl mt-4">Confirm sign-in</h1>
            <p className="text-sm text-muted-foreground mt-2">Continue to open your Tawqeet workspace on this device. Only continue if you requested this link.</p>
            <Button className="mt-6 w-full h-11" onClick={go} disabled={pending} data-testid="button-continue">
              {pending ? "Verifying" : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
