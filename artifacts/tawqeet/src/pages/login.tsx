import { useState, type FormEvent } from "react";
import { useRequestMagicLink, useGetDemoStatus, getGetDemoStatusQueryKey, useDemoLogin } from "@workspace/api-client-react";
import { ArrowRight, MailCheck, AlertTriangle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand";
import { apiErrorMessage } from "@/lib/api-error";

export default function LoginPage({ loginConfigured }: { loginConfigured: boolean }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const req = useRequestMagicLink();
  const demo = useGetDemoStatus({ query: { queryKey: getGetDemoStatusQueryKey(), retry: false } });
  const demoLogin = useDemoLogin();
  const demoOn = !!demo.data?.enabled;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setLocalErr("Enter a valid work email address."); return; }
    setLocalErr(null);
    req.mutate({ data: { email: v } }, { onSuccess: () => setSentTo(v) });
  };

  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-sidebar text-sidebar-foreground p-12">
        <div className="absolute inset-0 girih opacity-40" />
        <svg className="absolute -right-40 top-1/2 -translate-y-1/2 h-[720px] w-[720px] opacity-60" viewBox="0 0 200 200" aria-hidden="true">
          {[90, 70, 50, 30].map((r) => <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="hsl(38 30% 88% / .18)" strokeWidth=".4" />)}
          <g className="sweep"><path d="M100 100 L100 10 A90 90 0 0 1 163.6 36.4 Z" fill="hsl(12 82% 56% / .22)" /></g>
          <circle cx="100" cy="100" r="2" fill="hsl(12 82% 56%)" />
        </svg>
        <div className="relative"><Wordmark light /></div>
        <div className="relative max-w-md rise">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-sidebar-primary">Dubai · Riyadh · Doha</div>
          <h1 className="font-display text-5xl xl:text-6xl leading-[1.02] mt-4">The right message, at the right <em className="text-sidebar-primary not-italic">moment</em>.</h1>
          <p className="mt-6 text-sidebar-foreground/70 leading-relaxed">A private workspace for GCC outbound agencies. Start with what matters: who each client is, who they sell to, and what they must never claim.</p>
        </div>
        <div className="relative font-mono text-[11px] text-sidebar-foreground/45">Foundation release · client profiles · <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/welcome`} className="underline hover:text-sidebar-foreground">About Tawqeet</a></div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rise">
          <div className="lg:hidden mb-10"><Wordmark /></div>
          <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/welcome`} className="mb-6 inline-block text-sm text-accent hover:underline" data-testid="link-welcome">What is Tawqeet? →</a>
          {demoOn && (
            <div className="rise" data-testid="panel-demo-login">
              <h2 className="font-display text-3xl">Demo workspace</h2>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">This is a shared demo workspace. Unverified contacts are labeled as samples, and approved emails go only to the demo recipient, never to leads. Anyone with the demo sign-in sees the same data.</p>
              {demoLogin.isError && <p role="alert" className="mt-3 text-sm text-destructive flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{apiErrorMessage(demoLogin.error, "Demo sign-in failed.")}</p>}
              <Button className="mt-6 w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90" disabled={demoLogin.isPending} data-testid="button-demo-login"
                onClick={() => demoLogin.mutate(undefined, { onSuccess: () => window.location.reload() })}>
                {demoLogin.isPending ? "Signing in" : <>Enter demo workspace <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </div>
          )}
          {!demoOn && !loginConfigured && (
            <div className="mb-6 rounded-md border border-accent/40 bg-accent/10 p-4 text-sm flex gap-3" data-testid="status-login-unconfigured">
              <Settings2 className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div><div className="font-medium">Sign-in is not fully configured</div>
                <p className="text-muted-foreground mt-1">The workspace owner needs to set the email sender and owner address on the server. You can still try, but the server may refuse the request.</p></div>
            </div>
          )}
          {demoOn ? null : sentTo ? (
            <div className="rise" data-testid="status-link-sent">
              <div className="h-12 w-12 rounded-full bg-accent/15 grid place-items-center"><MailCheck className="h-5 w-5 text-accent" /></div>
              <h2 className="font-display text-3xl mt-5">Check your inbox</h2>
              <p className="text-muted-foreground mt-3 leading-relaxed">If <span className="text-foreground font-medium">{sentTo}</span> has access, a sign-in link is on its way. It works once and expires shortly.</p>
              <Button variant="outline" className="mt-8 w-full" onClick={() => { setSentTo(null); req.reset(); }} data-testid="button-use-different-email">Use a different email</Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h2 className="font-display text-3xl">Sign in</h2>
              <p className="text-muted-foreground mt-2 text-sm">No passwords. We email you a one-time link.</p>
              <Label htmlFor="email" className="mt-8 block text-xs uppercase tracking-wider text-muted-foreground">Work email</Label>
              <Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.ae" className="mt-2 h-11 bg-card" aria-invalid={!!localErr} data-testid="input-email" />
              {(localErr || req.isError) && (
                <p role="alert" className="mt-3 text-sm text-destructive flex gap-2" data-testid="text-login-error">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{localErr ?? apiErrorMessage(req.error, "The server could not send a link.")}
                </p>
              )}
              <Button type="submit" className="mt-6 w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90" disabled={req.isPending} data-testid="button-send-link">
                {req.isPending ? "Sending link" : <>Email me a sign-in link <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
              <p className="mt-8 text-xs text-muted-foreground leading-relaxed">Access is invite-only. Links are tied to the address you enter and can be used once.</p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
