import { CheckCircle2, CreditCard, Download, Mail, Plus, Trash2, XCircle } from "lucide-react";
import * as React from "react";
import { Link, useLocation, useSearch } from "wouter";
import { PageHeader, Stat } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, TagInput, Textarea } from "@/components/ui/input";
import { Empty, Skeleton, Switch, Table, Td, Th } from "@/components/ui/misc";
import { api, useAction, useApi, type Client } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn, dateTime, FLAG, timeAgo, usd } from "@/lib/utils";

const TABS = [
  ["agency", "Agency"],
  ["clients", "Clients"],
  ["team", "Team"],
  ["mailboxes", "Mailboxes"],
  ["alerts", "Alerts"],
  ["billing", "Billing"],
  ["compliance", "Compliance"],
  ["usage", "AI usage"],
  ["system", "System check"],
] as const;

function ClientPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const { clients } = useSession();
  React.useEffect(() => {
    if (!value && clients[0]) onChange(clients[0].id);
  }, [value, clients]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-56">
      {clients.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </Select>
  );
}

function useScopedClient() {
  const { clientId } = useSession();
  const search = new URLSearchParams(useSearch());
  return React.useState<string | null>(search.get("client") ?? clientId);
}

// ---------- agency ----------
function AgencyTab() {
  const { me, isOwner } = useSession();
  const [name, setName] = React.useState(me.agency!.name);
  const save = useAction(() => api("/agency", { method: "PATCH", json: { name } }), { invalidate: [["me"]], success: "Agency renamed" });
  return (
    <Card className="max-w-xl">
      <CardHeader title="Agency" description="Your one workspace. Clients, leads and drafts all live inside it." />
      <CardBody className="grid gap-3">
        <Field label="Agency name"><Input value={name} disabled={!isOwner} onChange={(e) => setName(e.target.value)} /></Field>
        {isOwner && <div><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div>}
      </CardBody>
    </Card>
  );
}

// ---------- clients ----------
function NewClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { setClientId } = useSession();
  const [, navigate] = useLocation();
  const [f, setF] = React.useState({ name: "", website: "", verticals: [] as string[], regions: ["AE"] as string[], languages: ["en"] as string[], offer: "" });
  const create = useAction(() => api<Client>("/clients", { method: "POST", json: { ...f, offer: f.offer || null } }), {
    invalidate: [["clients"], ["me"]],
    success: "Client added",
    onSuccess: (c) => {
      onOpenChange(false);
      setClientId(c.id);
      navigate(`/clients/${c.id}/brain`);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a client" description="A company you run outbound for. Next you'll fill in their brain." wide>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <Field label="Name"><Input required autoFocus dir="auto" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Website"><Input type="url" placeholder="https://" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></Field>
          <Field label="Verticals"><TagInput value={f.verticals} onChange={(v) => setF({ ...f, verticals: v })} placeholder="Logistics, HR tech" /></Field>
          <Field label="Target countries">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(FLAG).map(([c, fl]) => (
                <button type="button" key={c} onClick={() => setF({ ...f, regions: f.regions.includes(c) ? f.regions.filter((x) => x !== c) : [...f.regions, c] })} className={cn("rounded-md border px-2 py-1 text-[12px]", f.regions.includes(c) ? "border-ink/30 bg-surface shadow-card" : "text-ink-3")}>
                  {fl} {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Offer (optional)" className="sm:col-span-2" hint="Or crawl their website from the Brain."><Textarea dir="auto" rows={2} value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value })} /></Field>
          <Field label="Email languages">
            <div className="flex gap-3 pt-1 text-[13px]">
              {(["en", "ar"] as const).map((l) => (
                <label key={l} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={f.languages.includes(l)} onChange={(e) => setF({ ...f, languages: e.target.checked ? [...f.languages, l] : f.languages.filter((x) => x !== l) })} />
                  {l === "en" ? "English" : "العربية"}
                </label>
              ))}
            </div>
          </Field>
          <div className="flex items-end justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" loading={create.isPending}>Add client</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClientsTab() {
  const { clients, me } = useSession();
  const search = new URLSearchParams(useSearch());
  const [open, setOpen] = React.useState(search.get("new") === "1");
  const del = useAction((id: string) => api(`/clients/${id}`, { method: "DELETE" }), { invalidate: [["clients"], ["me"]], success: "Client deleted" });
  const u = me.usage!;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-2">
          <span className="num font-semibold">{u.clients}</span> of <span className="num">{u.clientLimit}</span> client workspaces on your plan
        </p>
        <Button variant="primary" onClick={() => setOpen(true)} disabled={u.clients >= u.clientLimit}><Plus /> Add client</Button>
      </div>
      {clients.length === 0 ? (
        <Empty title="No clients yet" action={<Button variant="primary" onClick={() => setOpen(true)}>Add your first client</Button>}>Add the first company you run outbound for.</Empty>
      ) : (
        <Card>
          <Table>
            <thead><tr><Th>Client</Th><Th>Countries</Th><Th>Leads</Th><Th>Ready</Th><Th /></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/clients/${c.id}/brain`} className="font-medium hover:underline">{c.name}</Link>
                    <div className="text-[12px] text-ink-3">{c.verticals.join(", ") || c.website}</div>
                  </Td>
                  <Td>{c.regions.map((r) => FLAG[r]).join(" ")}</Td>
                  <Td className="num text-[12.5px]">
                    <span className="text-hot">{c.counts?.hot ?? 0}</span> · <span>{c.counts?.warm ?? 0}</span> · <span className="text-cold">{c.counts?.cold ?? 0}</span>
                  </Td>
                  <Td>{c.ready ? <Badge tone="hot">{c.ready}</Badge> : <span className="text-ink-3">—</span>}</Td>
                  <Td className="text-end">
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${c.name} and all its leads, drafts and sends?`) && del.mutate(c.id)}><Trash2 /></Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <NewClientDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

// ---------- team ----------
type Member = { id: string; email: string; name: string | null; role: string; clientName: string | null; lastLoginAt: string | null };
function TeamTab() {
  const { me, clients, isOwner } = useSession();
  const team = useApi<Member[]>(["team"], "/team");
  const [f, setF] = React.useState({ email: "", role: "member", clientId: "" });
  const invite = useAction(() => api("/team/invite", { method: "POST", json: { email: f.email, role: f.role, clientId: f.role === "client_viewer" ? f.clientId || clients[0]?.id : undefined } }), {
    invalidate: [["team"]],
    success: "Invite sent — they'll get a sign-in link",
    onSuccess: () => setF({ ...f, email: "" }),
  });
  const remove = useAction((id: string) => api(`/team/${id}`, { method: "DELETE" }), { invalidate: [["team"]], success: "Removed" });
  return (
    <div className="grid gap-4">
      {isOwner && (
        <Card>
          <CardHeader title="Invite" description="Members work across all clients. Client viewers see only their own company's emails and reports, read-only." />
          <CardBody>
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), invite.mutate())}>
              <Field label="Email" className="min-w-56 flex-1"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Role">
                <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="w-40">
                  <option value="member">Member</option>
                  <option value="owner">Owner</option>
                  <option value="client_viewer">Client viewer</option>
                </Select>
              </Field>
              {f.role === "client_viewer" && (
                <Field label="Client">
                  <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} className="w-48">
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              )}
              <Button variant="primary" loading={invite.isPending}><Mail /> Send invite</Button>
            </form>
          </CardBody>
        </Card>
      )}
      <Card>
        <Table>
          <thead><tr><Th>Person</Th><Th>Role</Th><Th>Last sign-in</Th><Th /></tr></thead>
          <tbody>
            {(team.data ?? []).map((m) => (
              <tr key={m.id}>
                <Td><div className="font-medium">{m.name ?? m.email}</div><div className="text-[12px] text-ink-3">{m.email}</div></Td>
                <Td><Badge tone={m.role === "owner" ? "ink" : "neutral"}>{m.role.replace("_", " ")}</Badge>{m.clientName && <span className="ms-2 text-[12px] text-ink-3">{m.clientName}</span>}</Td>
                <Td className="text-[12.5px] text-ink-3">{m.lastLoginAt ? timeAgo(m.lastLoginAt) : "Invited"}</Td>
                <Td className="text-end">{isOwner && m.id !== me.user.id && <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.id)}><Trash2 /></Button>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ---------- mailboxes ----------
type Mailbox = { id: string; provider: string; email: string; dailyCap: number; status: string; pausedReason: string | null; createdAt: string };
function MailboxesTab() {
  const [clientId, setClientId] = useScopedClient();
  const search = new URLSearchParams(useSearch());
  const q = useApi<{ mailboxes: Mailbox[]; providers: { gmail: boolean; outlook: boolean; demo: boolean } }>(["mailboxes", clientId], clientId ? `/clients/${clientId}/mailboxes` : null);
  const inv = [["mailboxes", clientId]];
  const connect = useAction((provider: string) => api<{ url?: string }>(`/clients/${clientId}/mailboxes/connect`, { method: "POST", json: { provider } }), {
    invalidate: inv,
    onSuccess: (o) => (o.url ? (window.location.href = o.url) : undefined),
    success: (o) => (o.url ? "" : "Demo mailbox added"),
  });
  const update = useAction(({ id, ...json }: { id: string; dailyCap?: number; status?: string }) => api(`/mailboxes/${id}`, { method: "PATCH", json }), { invalidate: inv, success: "Mailbox updated" });
  const remove = useAction((id: string) => api(`/mailboxes/${id}`, { method: "DELETE" }), { invalidate: inv, success: "Disconnected" });
  const p = q.data?.providers;
  return (
    <div className="grid gap-4">
      {search.get("error") && <p className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">Couldn't connect: {search.get("error")}</p>}
      {search.get("connected") && <p className="rounded-lg bg-good-soft px-3 py-2 text-[13px] text-good">Mailbox connected.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <ClientPicker value={clientId} onChange={setClientId} />
        <div className="ms-auto flex flex-wrap gap-2">
          <Button disabled={!p?.gmail} onClick={() => connect.mutate("gmail")}>Connect Gmail</Button>
          <Button disabled={!p?.outlook} onClick={() => connect.mutate("outlook")}>Connect Outlook</Button>
          {p?.demo && <Button variant="ghost" onClick={() => connect.mutate("demo")}>Add demo mailbox</Button>}
        </div>
      </div>
      <p className="text-[12.5px] text-ink-3">
        Send-only scopes: Gmail <code className="num">gmail.send</code>, Outlook <code className="num">Mail.Send</code>. We never request read access. Tokens are encrypted at rest. Demo mailboxes record sends without transmitting (development only).
      </p>
      {!q.data?.mailboxes.length ? (
        <Empty icon={<Mail />} title="No mailbox for this client">Emails are sent from the client's own mailbox, so replies land with them.</Empty>
      ) : (
        <Card className="divide-y">
          {q.data.mailboxes.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{m.email}</div>
                <div className="text-[12px] text-ink-3">{m.provider} · connected {timeAgo(m.createdAt)}{m.pausedReason && ` · ${m.pausedReason}`}</div>
              </div>
              <Badge tone={m.status === "connected" ? "good" : m.status === "paused" ? "warm" : "bad"}>{m.status}</Badge>
              <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                Daily cap
                <Input type="number" min={1} max={200} defaultValue={m.dailyCap} className="h-8 w-20" onBlur={(e) => Number(e.target.value) !== m.dailyCap && update.mutate({ id: m.id, dailyCap: Number(e.target.value) })} />
              </label>
              {m.status !== "revoked" && (
                <Button size="sm" onClick={() => update.mutate({ id: m.id, status: m.status === "paused" ? "connected" : "paused" })}>{m.status === "paused" ? "Resume" : "Pause"}</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.id)}><Trash2 /></Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- alerts ----------
type Rule = { id: string; minTemperature: string; channel: string; target: string; active: boolean; hasToken: boolean };
const CHANNEL_HINT: Record<string, string> = {
  email: "Recipient email",
  sms: "Phone in E.164, e.g. +9715…",
  webhook: "https:// URL — receives {lead, company, signals, temp_score, why_now, dashboard_url}",
  asana: "Asana project ID",
  clickup: "ClickUp list ID",
  trello: "Trello list ID",
};
function AlertsTab() {
  const [clientId, setClientId] = useScopedClient();
  const rules = useApi<Rule[]>(["rules", clientId], clientId ? `/clients/${clientId}/alert-rules` : null);
  const inv = [["rules", clientId]];
  const [f, setF] = React.useState({ minTemperature: "hot", channel: "email", target: "", token: "" });
  const add = useAction(() => api(`/clients/${clientId}/alert-rules`, { method: "POST", json: { ...f, token: f.token || undefined } }), { invalidate: inv, success: "Alert rule added", onSuccess: () => setF({ ...f, target: "", token: "" }) });
  const toggle = useAction((r: Rule) => api(`/alert-rules/${r.id}`, { method: "PATCH", json: { active: !r.active } }), { invalidate: inv });
  const test = useAction((r: Rule) => api(`/alert-rules/${r.id}/test`, { method: "POST" }), { success: "Test alert sent" });
  const remove = useAction((r: Rule) => api(`/alert-rules/${r.id}`, { method: "DELETE" }), { invalidate: inv });
  const pm = ["asana", "clickup", "trello"].includes(f.channel);
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2"><ClientPicker value={clientId} onChange={setClientId} /></div>
      <Card>
        <CardHeader title="Delivery rules" description="Hot: instant (SMS held 21:00–08:00 client time, max 5 per day then bundled). Warm: 08:30 digest on workdays (UAE Mon–Fri, KSA Sun–Thu). Cold: weekly watchlist. No repeat within 7 days unless the score rises 15+." />
        <CardBody>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
            <Field label="When">
              <Select value={f.minTemperature} onChange={(e) => setF({ ...f, minTemperature: e.target.value })} className="w-36">
                <option value="hot">Hot only</option>
                <option value="warm">Warm and hot</option>
              </Select>
            </Field>
            <Field label="Channel">
              <Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className="w-32">
                {Object.keys(CHANNEL_HINT).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label={CHANNEL_HINT[f.channel]} className="min-w-56 flex-1"><Input required value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
            {pm && <Field label={f.channel === "trello" ? "key:token" : "API token"} className="w-56"><Input required type="password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></Field>}
            <Button variant="primary" loading={add.isPending}><Plus /> Add</Button>
          </form>
        </CardBody>
      </Card>
      {(rules.data ?? []).length > 0 && (
        <Card className="divide-y">
          {rules.data!.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Badge tone={r.minTemperature === "hot" ? "hot" : "warm"}>{r.minTemperature === "hot" ? "Hot" : "Warm+"}</Badge>
              <span className="font-medium capitalize">{r.channel}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{r.target}{r.hasToken && " · token saved (encrypted)"}</span>
              <Switch checked={r.active} onCheckedChange={() => toggle.mutate(r)} />
              <Button size="sm" onClick={() => test.mutate(r)} loading={test.isPending}>Test</Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(r)}><Trash2 /></Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- billing ----------
type Billing = { plan: { priceUsd: number; includedClients: number; includedSimulations: number; extraClientUsd: number; simPackSize: number; simPackUsd: number }; agency: { plan: string; status: string | null; extraClients: number; simPackCredits: number }; usage: { clients: number; clientLimit: number; simulated: number; simLimit: number }; configured: boolean };
function BillingTab() {
  const { isOwner } = useSession();
  const search = new URLSearchParams(useSearch());
  const q = useApi<Billing>(["billing"], isOwner ? "/billing" : null);
  const go = (o: { url: string }) => (window.location.href = o.url);
  const checkout = useAction((kind: "plan" | "sim_pack") => api<{ url: string }>("/billing/checkout", { method: "POST", json: { kind } }), { onSuccess: go });
  const portal = useAction(() => api<{ url: string }>("/billing/portal", { method: "POST" }), { onSuccess: go });
  const [extra, setExtra] = React.useState<number | null>(null);
  const seats = useAction(() => api("/billing/extra-clients", { method: "POST", json: { extra } }), { invalidate: [["billing"], ["me"]], success: "Client workspaces updated" });
  if (!isOwner) return <Empty title="Only the agency owner manages billing" />;
  const b = q.data;
  if (!b) return <Skeleton className="h-64 rounded-xl" />;
  const paid = b.agency.plan === "agency";
  return (
    <div className="grid gap-4">
      {search.get("billing") === "success" && <p className="rounded-lg bg-good-soft px-3 py-2 text-[13px] text-good">Payment received. It can take a moment to show here.</p>}
      {!b.configured && <p className="rounded-lg bg-warm-soft px-3 py-2 text-[13px] text-ink-2">Stripe isn't configured yet (see System check). Plan limits still apply.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Plan" value={paid ? "Agency" : b.agency.plan === "canceled" ? "Canceled" : "Trial"} sub={paid ? `${usd(b.plan.priceUsd)}/mo · ${b.agency.status}` : "2 clients · 100 simulations"} />
        <Stat label="Client workspaces" value={`${b.usage.clients}/${b.usage.clientLimit}`} sub={paid ? `${b.plan.includedClients} included + ${b.agency.extraClients} extra` : undefined} />
        <Stat label="Simulated emails · this month" value={`${b.usage.simulated.toLocaleString()}/${b.usage.simLimit.toLocaleString()}`} sub={b.agency.simPackCredits ? `includes ${b.agency.simPackCredits.toLocaleString()} from packs` : undefined} accent={b.usage.simulated / b.usage.simLimit > 0.85 ? "hot" : undefined} />
      </div>
      <Card>
        <CardHeader title="Agency plan" description={`${usd(b.plan.priceUsd)}/month · ${b.plan.includedClients} client workspaces · ${b.plan.includedSimulations.toLocaleString()} simulated emails a month`} />
        <CardBody className="flex flex-wrap items-end gap-3">
          {!paid ? (
            <Button variant="hot" disabled={!b.configured} loading={checkout.isPending} onClick={() => checkout.mutate("plan")}><CreditCard /> Start the Agency plan</Button>
          ) : (
            <>
              <Field label={`Extra clients (${usd(b.plan.extraClientUsd)}/mo each)`}>
                <div className="flex gap-2">
                  <Input type="number" min={0} max={100} className="w-24" value={extra ?? b.agency.extraClients} onChange={(e) => setExtra(Number(e.target.value))} />
                  <Button disabled={extra === null || extra === b.agency.extraClients} loading={seats.isPending} onClick={() => seats.mutate()}>Update</Button>
                </div>
              </Field>
              <Button disabled={!b.configured} loading={checkout.isPending} onClick={() => checkout.mutate("sim_pack")}>Buy {b.plan.simPackSize.toLocaleString()} simulations · {usd(b.plan.simPackUsd)}</Button>
              <Button variant="ghost" loading={portal.isPending} onClick={() => portal.mutate()}>Invoices & payment method</Button>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------- compliance ----------
type Supp = { id: string; agencyId: string | null; email: string | null; domain: string | null; reason: string; createdAt: string };
type AuditEntry = { id: string; action: string; entity: string; entityId: string | null; meta: Record<string, unknown>; createdAt: string; userEmail: string | null };
function ComplianceTab() {
  const { isOwner } = useSession();
  const supp = useApi<Supp[]>(["suppression"], "/suppression");
  const audit = useApi<AuditEntry[]>(["audit"], "/audit");
  const [s, setS] = React.useState({ value: "", reason: "" });
  const add = useAction(() => api("/suppression", { method: "POST", json: { ...(s.value.includes("@") ? { email: s.value } : { domain: s.value }), reason: s.reason || "Added manually" } }), { invalidate: [["suppression"]], success: "Suppressed", onSuccess: () => setS({ value: "", reason: "" }) });
  const del = useAction((id: string) => api(`/suppression/${id}`, { method: "DELETE" }), { invalidate: [["suppression"]] });
  const [contact, setContact] = React.useState("");
  const erase = useAction(() => api<{ deleted: number }>("/contacts", { method: "DELETE", json: { email: contact } }), { success: (o) => `Erased ${o.deleted} record(s); address suppressed`, invalidate: [["suppression"], ["leads"]] });
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Guardrails" />
        <CardBody>
          <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
            {[
              "B2B work emails only — free-mail domains are blocked",
              "Relevant roles only (ICP titles) and a signal-based reason in every email",
              "Opt-out line + List-Unsubscribe header on every send",
              "Global and agency suppression lists, checked at approval and again at send time",
              "Daily caps per mailbox and a 2–6 minute gap between sends",
              "Legal basis recorded per lead (default: legitimate interest)",
              "Mailboxes auto-pause above 3% bounces or on a spam-complaint signal",
              "Every send is approved by a named person and audit-logged",
            ].map((x) => (
              <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> {x}</li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Suppression list" description="Emails or whole domains that are never contacted." />
          <CardBody>
            <form className="mb-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
              <Input required placeholder="name@company.ae or company.ae" value={s.value} onChange={(e) => setS({ ...s, value: e.target.value })} />
              <Input placeholder="Reason" value={s.reason} onChange={(e) => setS({ ...s, reason: e.target.value })} className="w-36" />
              <Button variant="primary" loading={add.isPending}>Add</Button>
            </form>
            <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {(supp.data ?? []).map((x) => (
                <div key={x.id} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate font-medium">{x.email ?? `@${x.domain}`}</span>
                  <span className="truncate text-ink-3">{x.reason}</span>
                  {!x.agencyId && <Badge>global</Badge>}
                  {x.agencyId && isOwner && <button onClick={() => del.mutate(x.id)} className="text-ink-3 hover:text-bad"><Trash2 className="size-3.5" /></button>}
                </div>
              ))}
              {!supp.data?.length && <p className="p-4 text-center text-[12.5px] text-ink-3">Empty</p>}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Contact data requests" description="Export or erase everything held about one person." />
          <CardBody className="grid gap-3">
            <Input type="email" placeholder="person@company.ae" value={contact} onChange={(e) => setContact(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={!contact.includes("@")} asChild={contact.includes("@")}>
                {contact.includes("@") ? <a href={`/api/contacts/export?email=${encodeURIComponent(contact)}`}><Download /> Export JSON</a> : <span><Download /> Export JSON</span>}
              </Button>
              {isOwner && (
                <Button variant="danger" disabled={!contact.includes("@")} loading={erase.isPending} onClick={() => confirm(`Erase all data for ${contact}? This can't be undone.`) && erase.mutate()}>
                  <Trash2 /> Erase & suppress
                </Button>
              )}
            </div>
            <p className="text-[12px] text-ink-3">Erasure deletes the lead, drafts, sends and replies, and keeps the address on the suppression list so it's never contacted again.</p>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Audit log" description="Who approved each send, and every other sensitive action." />
        <Table>
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Details</Th></tr></thead>
          <tbody>
            {(audit.data ?? []).slice(0, 100).map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-[12px] text-ink-3">{dateTime(a.createdAt)}</Td>
                <Td className="text-[12.5px]">{a.userEmail ?? "system"}</Td>
                <Td><Badge tone={a.action.startsWith("send") ? "ink" : "neutral"}>{a.action}</Badge></Td>
                <Td className="max-w-96 truncate font-mono text-[11px] text-ink-3">{JSON.stringify(a.meta)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ---------- AI usage ----------
function UsageTab() {
  const q = useApi<{ byPurpose: { purpose: string; calls: number; tokensIn: number; tokensOut: number; cost: string }[]; byClient: { client: string | null; calls: number; cost: string }[] }>(["ai-usage"], "/ai-usage");
  const total = (q.data?.byPurpose ?? []).reduce((s, r) => s + Number(r.cost), 0);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="AI cost · this month" value={usd(total)} />
        <Stat label="Calls" value={(q.data?.byPurpose ?? []).reduce((s, r) => s + r.calls, 0).toLocaleString()} />
        <Stat label="Tokens" value={(q.data?.byPurpose ?? []).reduce((s, r) => s + r.tokensIn + r.tokensOut, 0).toLocaleString()} />
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Purpose</Th><Th className="text-end">Calls</Th><Th className="text-end">Tokens in</Th><Th className="text-end">Tokens out</Th><Th className="text-end">Cost</Th></tr></thead>
          <tbody>
            {(q.data?.byPurpose ?? []).map((r) => (
              <tr key={r.purpose}>
                <Td className="font-mono text-[12px]">{r.purpose}</Td>
                <Td className="num text-end">{r.calls}</Td>
                <Td className="num text-end">{r.tokensIn.toLocaleString()}</Td>
                <Td className="num text-end">{r.tokensOut.toLocaleString()}</Td>
                <Td className="num text-end">{usd(r.cost)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ---------- system check ----------
type Check = { key: string; label: string; group: string; ok: boolean; required: boolean; detail: string };
function SystemTab() {
  const q = useApi<Check[]>(["system"], "/system-check");
  if (!q.data) return <Skeleton className="h-96 rounded-xl" />;
  const groups = [...new Set(q.data.map((c) => c.group))];
  const missing = q.data.filter((c) => c.required && !c.ok).length;
  return (
    <div className="grid gap-4">
      <p className={cn("rounded-lg px-3 py-2 text-[13px]", missing ? "bg-warm-soft text-ink-2" : "bg-good-soft text-good")}>
        {missing ? `${missing} required setting${missing > 1 ? "s" : ""} missing.` : "All required settings are in place."} Values are never shown — only whether each one is set.
      </p>
      {groups.map((g) => (
        <Card key={g}>
          <CardHeader title={g} />
          <div className="divide-y border-t">
            {q.data!.filter((c) => c.group === g).map((c) => (
              <div key={c.key} className="flex items-start gap-3 px-5 py-3">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-good" aria-label="OK" /> : <XCircle className={cn("mt-0.5 size-[18px] shrink-0", c.required ? "text-bad" : "text-ink-3")} aria-label="Missing" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{c.label}</span>
                    {!c.required && <Badge tone="outline">optional</Badge>}
                  </div>
                  <div className="font-mono text-[11px] text-ink-3">{c.key}</div>
                </div>
                <span className={cn("max-w-[50%] text-end text-[12.5px]", c.ok ? "text-good" : c.required ? "text-bad" : "text-ink-3")}>{c.detail}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function SettingsPage({ tab = "agency" }: { tab?: string }) {
  const [, navigate] = useLocation();
  const current = TABS.find(([k]) => k === tab)?.[0] ?? "agency";
  const Body = { agency: AgencyTab, clients: ClientsTab, team: TeamTab, mailboxes: MailboxesTab, alerts: AlertsTab, billing: BillingTab, compliance: ComplianceTab, usage: UsageTab, system: SystemTab }[current];
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b pb-px scrollbar-thin">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => navigate(`/settings/${k}`)} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition", k === current ? "border-hot text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>
      <Body />
    </>
  );
}
