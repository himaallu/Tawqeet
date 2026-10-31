import { Play, Plus, Radar as RadarIcon } from "lucide-react";
import * as React from "react";
import { HeatBar, SignalChip } from "@/components/heat";
import { PageHeader, Section } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Empty, Skeleton, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from "@/components/ui/misc";
import { api, useAction, useApi, type Company, type Temperature } from "@/lib/api";
import { useClientQuery, useSession } from "@/lib/session";
import { cn, FLAG, isArabic, timeAgo } from "@/lib/utils";

type Sig = { id: string; companyId: string; title: string; summary: string | null; url: string | null; source: string; key: string; name: string; detectedAt: string; language: string; company?: string };
type Account = { id: string; fit: number; fitReason: string | null; tempScore: number; temperature: Temperature; whyNow: string | null; company: Company; clientName: string; signals: Sig[] };
type Def = { id: string; key: string; name: string; baseWeight: number; halfLifeDays: number; active: boolean; sourceType: string };

function AddSignal() {
  const defs = useApi<Def[]>(["defs"], "/signal-definitions");
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ companyName: "", domain: "", country: "AE", definitionKey: "funding_round", title: "", summary: "", url: "", language: "en" });
  const add = useAction(() => api("/radar/signals", { method: "POST", json: f }), {
    invalidate: [["radar"], ["dashboard"]],
    success: "Signal added — matching it to your clients now",
    onSuccess: () => setOpen(false),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus /> Add signal
      </Button>
      <DialogContent title="Add a signal" description="Spotted something the radar missed? It goes through the same pipeline: ICP match, thermometer, drafts, simulation, alerts." wide>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Field label="Company"><Input required value={f.companyName} onChange={set("companyName")} placeholder="Noor Retail Group" dir="auto" /></Field>
          <Field label="Domain"><Input value={f.domain} onChange={set("domain")} placeholder="noorretail.ae" /></Field>
          <Field label="Country">
            <Select value={f.country} onChange={set("country")}>
              {Object.entries(FLAG).map(([c, fl]) => (
                <option key={c} value={c}>{fl} {c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Signal type">
            <Select value={f.definitionKey} onChange={set("definitionKey")}>
              {(defs.data ?? []).filter((d) => d.active).map((d) => (
                <option key={d.key} value={d.key}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Headline" className="sm:col-span-2"><Input required value={f.title} onChange={set("title")} dir="auto" placeholder="Noor Retail Group raises AED 120M Series B" /></Field>
          <Field label="Summary" className="sm:col-span-2"><Textarea value={f.summary} onChange={set("summary")} dir="auto" rows={3} /></Field>
          <Field label="Source URL"><Input type="url" value={f.url} onChange={set("url")} placeholder="https://" /></Field>
          <Field label="Language">
            <Select value={f.language} onChange={set("language")}>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={add.isPending}>Add to radar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RadarPage() {
  const { me, client } = useSession();
  const qs = useClientQuery();
  const q = useApi<{ accounts: Account[]; feed: Sig[] }>(["radar", qs], `/radar${qs}`);
  const defs = useApi<Def[]>(["defs"], "/signal-definitions");
  const run = useAction((job: string) => api(`/radar/run/${job}`, { method: "POST" }), { success: "Job queued — the worker will pick it up" });

  return (
    <>
      <PageHeader
        eyebrow={client?.name ?? "All clients"}
        title="Radar"
        description="Gulf business signals matched to your clients' ICPs. News every 30 minutes (07:00–22:00 GST), careers pages nightly, tenders at 06:00, people & funding weekly."
        actions={
          <>
            {me.admin && (
              <Menu>
                <MenuTrigger asChild>
                  <Button><Play /> Run now</Button>
                </MenuTrigger>
                <MenuContent>
                  {[["radar-news", "News feeds"], ["radar-careers", "Careers pages"], ["radar-tenders", "Tenders & registries"], ["radar-people", "People & funding (paid)"], ["thermo-decay", "Thermometer recompute"]].map(([k, l]) => (
                    <MenuItem key={k} onSelect={() => run.mutate(k)}>{l}</MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            )}
            <AddSignal />
          </>
        }
      />
      <Tabs defaultValue="accounts">
        <TabsList className="mb-4">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="feed">Signal feed</TabsTrigger>
          <TabsTrigger value="weights">Signal weights</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts">
          {q.isLoading ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : !q.data?.accounts.length ? (
            <Empty icon={<RadarIcon />} title="No matched accounts yet" action={<AddSignal />}>When a signal fits a client's ICP, the company is tracked here with its own thermometer.</Empty>
          ) : (
            <Card>
              <Table>
                <thead>
                  <tr>
                    <Th>Heat</Th>
                    <Th>Company</Th>
                    <Th className="hidden md:table-cell">Why now</Th>
                    <Th className="hidden lg:table-cell">Signals</Th>
                    <Th>Fit</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-2/50">
                      <Td><HeatBar score={a.tempScore} temperature={a.temperature} /></Td>
                      <Td>
                        <div className="font-medium">{a.company.name} {FLAG[a.company.country ?? ""]}</div>
                        <div className="text-[12px] text-ink-3">{[a.company.domain, a.company.vertical].filter(Boolean).join(" · ")}{!client && ` · for ${a.clientName}`}</div>
                      </Td>
                      <Td className="hidden max-w-80 md:table-cell"><p dir="auto" className="line-clamp-2 text-[12.5px] text-ink-2">{a.whyNow}</p></Td>
                      <Td className="hidden max-w-72 lg:table-cell">
                        <div className="flex flex-wrap gap-1">{a.signals.slice(0, 3).map((s) => <SignalChip key={s.id} s={s} compact />)}</div>
                      </Td>
                      <Td><span className="num text-[12.5px]">{a.fit}/25</span></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="feed">
          <Card className="divide-y">
            {(q.data?.feed ?? []).map((s) => (
              <div key={s.id} className="flex gap-3 px-4 py-3">
                <span className="mt-1 text-[11px] text-ink-3 w-16 shrink-0">{timeAgo(s.detectedAt)}</span>
                <div className="min-w-0 flex-1">
                  <p dir="auto" className={cn("text-[13px] font-medium", isArabic(s.title) && "text-[14px]")}>
                    {s.url?.startsWith("http") ? <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.title}</a> : s.title}
                  </p>
                  {s.summary && s.summary !== s.title && <p dir="auto" className="mt-0.5 text-[12.5px] text-ink-2">{s.summary}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
                    <Badge tone="outline">{s.name}</Badge> {s.company} · {s.source}
                  </div>
                </div>
              </div>
            ))}
            {!q.data?.feed.length && <p className="p-6 text-center text-[13px] text-ink-3">No signals yet.</p>}
          </Card>
        </TabsContent>
        <TabsContent value="weights">
          <Section title="Placeholder signal list — the founders will replace it">
            <Card>
              <Table>
                <thead><tr><Th>Signal</Th><Th>Source</Th><Th>Base weight</Th><Th>Half-life</Th><Th>Active</Th></tr></thead>
                <tbody>
                  {(defs.data ?? []).map((d) => (
                    <tr key={d.id}>
                      <Td className="font-medium">{d.name}<div className="num text-[11px] text-ink-3">{d.key}</div></Td>
                      <Td className="text-ink-2">{d.sourceType.replace("_", " ")}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <span className="num w-6 text-end">{d.baseWeight}</span>
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-ink-2" style={{ width: `${(d.baseWeight / 40) * 100}%` }} /></span>
                        </span>
                      </Td>
                      <Td className="num">{d.halfLifeDays}d</Td>
                      <Td>{d.active ? <Badge tone="good">on</Badge> : <Badge>off</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <p className="mt-2 text-[12px] text-ink-3">Points = base weight × 0.5^(age ÷ half-life). Platform admins can edit weights in Settings › Radar.</p>
          </Section>
        </TabsContent>
      </Tabs>
    </>
  );
}
