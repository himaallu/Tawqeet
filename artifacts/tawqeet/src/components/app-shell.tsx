import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, useGetAgency, getGetAgencyQueryKey, type User } from "@workspace/api-client-react";
import { Radar, Users, Send, Brain, Layers, Settings, Building2, Activity, LogOut, Menu, X, ShieldCheck, BellRing, CreditCard, Scale, BarChart3 } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { roleLabel, can } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";

const soon = [
  { label: "Plays", icon: Layers },
];

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const logout = useLogout();
  const { data: agency } = useGetAgency({ query: { enabled: !!user, queryKey: getGetAgencyQueryKey() } });
  const perms = can(user);
  const clientId = location.match(/^\/clients\/([^/?]+)/)?.[1];
  const inBrain = /^\/clients\/[^/]+\/brain/.test(location);

  const doLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => { qc.clear(); setLocation("/login"); },
      onError: (e) => toast({ title: "Sign out failed", description: apiErrorMessage(e), variant: "destructive" }),
    });

  const active = (p: string) => location === p || location.startsWith(p + "/");
  const item = (href: string, label: string, Icon: typeof Radar, testid: string, selected = active(href)) => (
    <Link href={href} onClick={() => setOpen(false)} data-testid={testid}
      title={label === "Brain" && !clientId ? "Choose a client, then select Open Brain" : undefined}
      className={"group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors " +
        (selected && !(href === "/settings" && (location.startsWith("/settings/system") || location.startsWith("/settings/signals")))
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_hsl(var(--sidebar-primary))]"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}>
      <Icon className="h-4 w-4" />{label}
    </Link>
  );

  const nav = (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-6 pb-5"><Wordmark light /></div>
      <div className="mx-4 mb-4 rounded-md border border-sidebar-border px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/50">Agency</div>
        <div className="text-sm font-medium truncate mt-0.5" dir="auto" data-testid="text-agency-name">{agency?.name ?? "\u2014"}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5" aria-label="Main">
        <div className="px-3 pt-2 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Workspace</div>
        {soon.map((s) => (
          <div key={s.label} aria-disabled="true" data-testid={"nav-soon-" + s.label.toLowerCase().replace(/\W+/g, "-")}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/35 cursor-not-allowed select-none">
            <s.icon className="h-4 w-4" />{s.label}
            <span className="ml-auto rounded-sm border border-sidebar-foreground/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">Soon</span>
          </div>
        ))}
        {item("/radar", "Radar", Radar, "nav-radar")}
        {perms.viewSignals && item("/review", "Review & Send", Send, "nav-review")}
        {perms.viewSignals && item("/reports", "Reports", BarChart3, "nav-reports")}
        {perms.viewSignals && item("/leads", "Leads", Users, "nav-leads")}
        {item("/clients", "Clients", Building2, "nav-clients", active("/clients") && !inBrain)}
        {item(clientId ? `/clients/${clientId}/brain` : "/clients", "Brain", Brain, "nav-brain", inBrain)}
        <div className="px-3 pt-5 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Admin</div>
        {item("/settings", "Settings", Settings, "nav-settings")}
        {perms.viewSignals && item("/settings/signals", "Signals", Activity, "nav-signals")}
        {perms.viewSignals && item("/settings/alerts", "Alerts", BellRing, "nav-alerts")}
        {perms.viewSignals && item("/settings/billing", "Billing", CreditCard, "nav-billing")}
        {perms.viewSignals && item("/settings/compliance", "Compliance", Scale, "nav-compliance")}
        {perms.systemChecks && item("/settings/system", "System checks", ShieldCheck, "nav-system")}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="text-sm truncate" data-testid="text-user-email">{user.email}</div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="rounded-sm bg-sidebar-primary/20 text-sidebar-primary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider" data-testid="text-user-role">{roleLabel[user.role]}</span>
          <button onClick={doLogout} disabled={logout.isPending} data-testid="button-logout"
            className="flex items-center gap-1.5 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-50">
            <LogOut className="h-3.5 w-3.5" />{logout.isPending ? "Signing out" : "Sign out"}
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-[100dvh] flex">
      <div className="hidden md:block fixed inset-y-0 left-0 z-30">{nav}</div>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="rise">{nav}</div>
          <button aria-label="Close menu" className="flex-1 bg-primary/40" onClick={() => setOpen(false)} />
        </div>
      )}
      <div className="flex-1 md:pl-64 min-w-0">
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b bg-background/90 backdrop-blur px-4 py-3">
          <Wordmark />
          <button aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} data-testid="button-menu" className="p-2 rounded-md hover:bg-secondary">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        <main className="mx-auto max-w-6xl px-4 md:px-10 py-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
