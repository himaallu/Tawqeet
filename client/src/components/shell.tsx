import { Command } from "cmdk";
import {
  BarChart3,
  BookOpen,
  Brain,
  Check,
  ChevronsUpDown,
  FileText,
  Gauge,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Radar,
  Search,
  Send,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import * as React from "react";
import { Link, useLocation } from "wouter";
import { api, queryClient } from "@/lib/api";
import { useSession, useTheme } from "@/lib/session";
import { cn, FLAG, initials } from "@/lib/utils";
import { Logo } from "./page";
import { Badge } from "./ui/badge";
import { Kbd } from "./ui/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger } from "./ui/menu";

type NavItem = { href: string; label: string; icon: React.ReactNode; staff?: boolean; badge?: number; viewer?: boolean };

function useNav(): NavItem[] {
  const { clients, clientId } = useSession();
  const ready = clients.filter((c) => !clientId || c.id === clientId).reduce((s, c) => s + (c.ready ?? 0), 0);
  return [
    { href: "/", label: "Overview", icon: <LayoutGrid />, viewer: true },
    { href: "/radar", label: "Radar", icon: <Radar />, staff: true },
    { href: "/leads", label: "Leads", icon: <Users />, staff: true },
    { href: "/review", label: "Review & Send", icon: <Send />, badge: ready, viewer: true },
    { href: "/brain", label: "Brain", icon: <Brain />, staff: true },
    { href: "/plays", label: "Plays", icon: <BookOpen />, staff: true },
    { href: "/calibration", label: "Calibration", icon: <Gauge />, staff: true },
    { href: "/reports", label: "Reports", icon: <FileText />, viewer: true },
  ];
}

function ClientSwitcher() {
  const { clients, client, setClientId, isStaff } = useSession();
  const [open, setOpen] = React.useState(false);
  if (!isStaff) {
    return (
      <div className="rounded-lg border bg-surface px-2.5 py-2 text-[13px] font-medium shadow-card">
        <span className="text-[11px] font-normal uppercase tracking-wide text-ink-3">Client</span>
        <div className="truncate">{client?.name ?? "—"}</div>
      </div>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg border bg-surface px-2.5 py-2 text-start shadow-card transition hover:border-line-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-3 text-[10.5px] font-semibold">{client ? initials(client.name) : "∗"}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] uppercase tracking-wide text-ink-3">Client</span>
            <span className="block truncate text-[13px] font-medium">{client?.name ?? "All clients"}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-ink-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60">
        {[{ id: null as string | null, name: "All clients", regions: [] as string[], ready: undefined as number | undefined }, ...clients].map((c) => (
          <button
            key={c.id ?? "all"}
            onClick={() => {
              setClientId(c.id);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-[13px] hover:bg-surface-3"
          >
            <span className="flex-1 truncate">{c.name}</span>
            <span className="text-[11px] text-ink-3">{c.regions.map((r) => FLAG[r]).join("")}</span>
            {!!c.ready && <Badge tone="hot">{c.ready}</Badge>}
            {(client?.id ?? null) === c.id && <Check className="size-3.5" />}
          </button>
        ))}
        <div className="my-1 h-px bg-line" />
        <Link href="/settings/clients" onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-3">
          Manage clients…
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [loc] = useLocation();
  const { isStaff } = useSession();
  const items = useNav().filter((i) => isStaff || i.viewer);
  return (
    <nav className="grid gap-0.5">
      {items.map((i) => {
        const active = i.href === "/" ? loc === "/" : loc.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={onNavigate}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition [&_svg]:size-[15px]",
              active ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:bg-surface-3/60 hover:text-ink",
            )}
          >
            <span className={cn(active ? "text-hot" : "text-ink-3 group-hover:text-ink-2")}>{i.icon}</span>
            <span className="flex-1">{i.label}</span>
            {!!i.badge && <span className="num rounded-md bg-hot px-1.5 text-[10.5px] font-semibold leading-[17px] text-white">{i.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { me, isStaff } = useSession();
  const { theme, setTheme } = useTheme();
  const [, navigate] = useLocation();
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    queryClient.clear();
    window.location.href = "/login";
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-surface-3/60">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-ink">{initials(me.user.name ?? me.user.email)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium">{me.agency?.name}</span>
            <span className="block truncate text-[11px] text-ink-3">{me.user.email}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent align="start" side="top" className="w-56">
        <MenuLabel>{me.user.role.replace("_", " ")}</MenuLabel>
        {isStaff && (
          <MenuItem onSelect={() => navigate("/settings")}>
            <Settings /> Settings
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        {(
          [
            ["light", "Light", <Sun key="s" />],
            ["dark", "Dark", <Moon key="m" />],
            ["system", "System", <Monitor key="d" />],
          ] as const
        ).map(([v, l, icon]) => (
          <MenuItem key={v} onSelect={(e) => (e.preventDefault(), setTheme(v))}>
            {icon} {l} {theme === v && <Check className="ms-auto" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={logout}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const [, navigate] = useLocation();
  const { clients, setClientId, isStaff } = useSession();
  const nav = useNav().filter((i) => isStaff || i.viewer);
  const go = (fn: () => void) => {
    fn();
    setOpen(false);
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <Command
        label="Command menu"
        className="mx-auto mt-[12vh] w-[calc(100vw-32px)] max-w-lg overflow-hidden rounded-2xl border bg-surface shadow-pop animate-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 text-ink-3" />
          <Command.Input autoFocus placeholder="Jump to a page or client…" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" />
          <Kbd>esc</Kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-3">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-3">Nothing found.</Command.Empty>
          <Command.Group heading="Go to">
            {nav.map((n) => (
              <Command.Item key={n.href} onSelect={() => go(() => navigate(n.href))} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] data-[selected=true]:bg-surface-3 [&_svg]:size-4 [&_svg]:text-ink-3">
                {n.icon} {n.label}
              </Command.Item>
            ))}
            {isStaff && (
              <Command.Item onSelect={() => go(() => navigate("/settings"))} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] data-[selected=true]:bg-surface-3 [&_svg]:size-4 [&_svg]:text-ink-3">
                <Settings /> Settings
              </Command.Item>
            )}
          </Command.Group>
          {isStaff && clients.length > 0 && (
            <Command.Group heading="Switch client">
              {clients.map((c) => (
                <Command.Item key={c.id} value={`client ${c.name}`} onSelect={() => go(() => setClientId(c.id))} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] data-[selected=true]:bg-surface-3">
                  <span className="grid size-5 place-items-center rounded bg-surface-3 text-[9.5px] font-semibold">{initials(c.name)}</span>
                  {c.name}
                  <span className="ms-auto text-ink-3">{c.regions.map((r) => FLAG[r]).join("")}</span>
                </Command.Item>
              ))}
              <Command.Item value="client all" onSelect={() => go(() => setClientId(null))} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] data-[selected=true]:bg-surface-3">
                <BarChart3 className="size-4 text-ink-3" /> All clients
              </Command.Item>
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center justify-between px-1.5 pt-1">
        <Link href="/" onClick={onNavigate}>
          <Logo />
        </Link>
        {onNavigate && (
          <button onClick={onNavigate} className="rounded-md p-1 text-ink-3 hover:bg-surface-3" aria-label="Close menu">
            <X className="size-4" />
          </button>
        )}
      </div>
      <ClientSwitcher />
      <button onClick={() => setPaletteOpen(true)} className="flex h-8 items-center gap-2 rounded-lg border border-dashed border-line-2 px-2.5 text-[12.5px] text-ink-3 transition hover:border-solid hover:bg-surface hover:text-ink-2">
        <Search className="size-3.5" />
        <span className="flex-1 text-start">Search</span>
        <Kbd>⌘K</Kbd>
      </button>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto grid gap-2">
        {me.offline && (
          <Link href="/settings/system" onClick={onNavigate} className="rounded-lg border border-warm/40 bg-warm-soft px-2.5 py-2 text-[11.5px] leading-snug text-ink-2">
            <span className="font-semibold text-ink">Offline demo mode.</span> No AI key set — drafts and simulations use built-in logic.
          </Link>
        )}
        <UserMenu />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r bg-surface-2/60 lg:block">{sidebar()}</aside>
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b bg-bg/85 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setDrawer(true)} className="rounded-md p-1.5 hover:bg-surface-3" aria-label="Open menu">
          <MenuIcon className="size-5" />
        </button>
        <Logo />
        <button onClick={() => setPaletteOpen(true)} className="rounded-md p-1.5 hover:bg-surface-3" aria-label="Search">
          <Search className="size-4.5" />
        </button>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-surface-2 shadow-pop animate-in" onClick={(e) => e.stopPropagation()}>
            {sidebar(() => setDrawer(false))}
          </aside>
        </div>
      )}
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-[1180px] animate-in">{children}</div>
      </main>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
    </div>
  );
}
