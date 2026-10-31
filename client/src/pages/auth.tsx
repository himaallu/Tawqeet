import { ArrowRight, Mail } from "lucide-react";
import * as React from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Logo } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError, queryClient, useApi, type Me } from "@/lib/api";

function AuthFrame({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_50%_at_50%_0%,var(--hot-soft),transparent_70%)] opacity-70" />
      <div className="relative w-full max-w-[380px] animate-in">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <div className="rounded-2xl border bg-surface p-6 shadow-pop">{children}</div>
        {footer && <div className="mt-4 text-center text-[12px] text-ink-3">{footer}</div>}
      </div>
    </div>
  );
}

export function LoginPage() {
  const search = new URLSearchParams(useSearch());
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(search.get("error") === "expired" ? "That link has expired or was already used. Request a new one." : "");
  const me = useApi<Me>(["me"], "/me", { retry: false });
  const [, navigate] = useLocation();
  React.useEffect(() => {
    if (me.data) navigate("/app");
  }, [me.data, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/request", { method: "POST", json: { email } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthFrame footer={<button className="underline-offset-4 hover:underline" onClick={() => setSent(false)}>Use a different email</button>}>
        <div className="grid justify-items-center gap-3 py-2 text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-hot-soft text-hot">
            <Mail className="size-5" />
          </span>
          <h1 className="text-[17px] font-semibold tracking-tight">Check your inbox</h1>
          <p className="text-[13px] text-ink-2">
            We sent a sign-in link to <span className="font-medium text-ink">{email}</span>. It works once and expires in 15 minutes.
          </p>
        </div>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame footer="No passwords. We email you a one-time link.">
      <h1 className="text-[17px] font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-[13px] text-ink-2">Welcome back. Enter your work email.</p>
      <form onSubmit={submit} className="mt-5 grid gap-3">
        <Field label="Work email">
          <Input type="email" autoComplete="email" required autoFocus placeholder="you@agency.ae" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error && <p className="text-[12.5px] text-bad">{error}</p>}
        <Button variant="primary" size="lg" loading={busy}>
          Email me a sign-in link <ArrowRight />
        </Button>
      </form>
    </AuthFrame>
  );
}

export function OnboardingPage() {
  const me = useApi<Me>(["me"], "/me", { retry: false });
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [, navigate] = useLocation();
  React.useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) navigate("/login");
    if (me.data?.agency) navigate("/app");
  }, [me.data, me.error, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/onboarding", { method: "POST", json: { name } });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/app/settings/clients?new=1");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <AuthFrame>
      <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-3">Step 1 of 2</span>
      <h1 className="mt-1 text-[17px] font-semibold tracking-tight">Name your agency</h1>
      <p className="mt-1 text-[13px] text-ink-2">Your clients, leads and drafts live inside it. You can rename it later.</p>
      <form onSubmit={submit} className="mt-5 grid gap-3">
        <Field label="Agency name">
          <Input required autoFocus minLength={2} placeholder="e.g. Falcon Outbound" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {error && <p className="text-[12.5px] text-bad">{error}</p>}
        <Button variant="primary" size="lg" loading={busy}>
          Create agency <ArrowRight />
        </Button>
      </form>
    </AuthFrame>
  );
}
