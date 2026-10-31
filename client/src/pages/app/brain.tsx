import { BadgeCheck, Building2, FileUp, Globe, Lightbulb, Link2, ListChecks, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import { Link, useSearch } from "wouter";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, TagInput, Textarea } from "@/components/ui/input";
import { Empty, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { api, useAction, useApi, type Client } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn, FLAG, timeAgo } from "@/lib/utils";

type CaseStudy = {
  id: string;
  customerName: string;
  customerVertical: string | null;
  customerCountry: string | null;
  customerSizeBand: string | null;
  problem: string | null;
  solution: string | null;
  resultMetric: string | null;
  resultValue: string | null;
  timeframe: string | null;
  quote: string | null;
  quotePersonTitle: string | null;
  canNameCustomer: boolean;
  language: string;
  source: string;
  sourceRef: string | null;
  approved: boolean;
};
type Entry = { id: string; kind: string; content: string; meta: Record<string, any>; createdAt: string };
type BrainData = { client: Client; entries: Entry[]; learnings: Entry[]; caseStudies: CaseStudy[]; crm: { hubspot: boolean } };

const REPLY_TONE: Record<string, "good" | "neutral" | "bad" | "warm"> = { positive: "good", neutral: "neutral", negative: "bad", ooo: "warm", unsubscribe: "bad" };

function ProfileCard({ client }: { client: Client }) {
  const [editing, setEditing] = React.useState(false);
  const [f, setF] = React.useState(client);
  React.useEffect(() => setF(client), [client]);
  const save = useAction(() => api(`/clients/${client.id}`, { method: "PATCH", json: { offer: f.offer, tone: f.tone, verticals: f.verticals, regions: f.regions, languages: f.languages, noGoClaims: f.noGoClaims, proofPoints: f.proofPoints, differentiators: f.differentiators, icp: f.icp } }), {
    invalidate: [["brain", client.id], ["clients"]],
    success: "Brain updated",
    onSuccess: () => setEditing(false),
  });
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid gap-1 border-b py-3 last:border-0 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="text-[13px]">{value}</dd>
    </div>
  );
  const chips = (xs: string[] | undefined, tone: "neutral" | "bad" = "neutral") =>
    xs?.length ? (
      <div className="flex flex-wrap gap-1">
        {xs.map((x) => (
          <Badge key={x} tone={tone} dir="auto">{x}</Badge>
        ))}
      </div>
    ) : (
      <span className="text-ink-3">—</span>
    );

  if (editing) {
    return (
      <Card>
        <CardHeader title="Edit profile" description="What the writer knows about this client. Only facts here (and in approved case studies) can appear as numbers in emails." />
        <CardBody className="grid gap-3">
          <Field label="Offer"><Textarea dir="auto" value={f.offer ?? ""} onChange={(e) => setF({ ...f, offer: e.target.value })} rows={3} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Verticals"><TagInput value={f.verticals} onChange={(v) => setF({ ...f, verticals: v })} placeholder="Logistics, Retail" /></Field>
            <Field label="Target countries" hint="AE, SA, QA, KW, BH, OM"><TagInput value={f.regions} onChange={(v) => setF({ ...f, regions: v.map((x) => x.toUpperCase()).filter((x) => x in FLAG) })} /></Field>
            <Field label="Target titles"><TagInput value={f.icp.titles ?? []} onChange={(v) => setF({ ...f, icp: { ...f.icp, titles: v } })} placeholder="VP Supply Chain" /></Field>
            <Field label="Target industries"><TagInput value={f.icp.industries ?? []} onChange={(v) => setF({ ...f, icp: { ...f.icp, industries: v } })} /></Field>
            <Field label="Company sizes" hint="e.g. 201-500"><TagInput value={f.icp.company_sizes ?? []} onChange={(v) => setF({ ...f, icp: { ...f.icp, company_sizes: v } })} /></Field>
            <Field label="Languages"><TagInput value={f.languages} onChange={(v) => setF({ ...f, languages: v.filter((x) => x === "en" || x === "ar") })} placeholder="en, ar" /></Field>
          </div>
          <Field label="Proof points" hint="Numbers here are allowed in emails."><TagInput value={f.proofPoints} onChange={(v) => setF({ ...f, proofPoints: v })} /></Field>
          <Field label="Differentiators"><TagInput value={f.differentiators} onChange={(v) => setF({ ...f, differentiators: v })} /></Field>
          <Field label="Never say (no-go claims)"><TagInput value={f.noGoClaims} onChange={(v) => setF({ ...f, noGoClaims: v })} /></Field>
          <Field label="Tone"><Input dir="auto" value={f.tone ?? ""} onChange={(e) => setF({ ...f, tone: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Profile" description="Merged from the website crawl, the onboarding form and CRM." action={<Button size="sm" onClick={() => setEditing(true)}><Pencil /> Edit</Button>} />
      <CardBody>
        <dl>
          {row("Offer", <p dir="auto" className="leading-relaxed">{client.offer ?? <span className="text-ink-3">Crawl the website or fill the form</span>}</p>)}
          {row("Sells to", <div className="grid gap-1.5">{chips(client.icp.titles)}{client.icp.notes && <p dir="auto" className="text-ink-2">{client.icp.notes}</p>}</div>)}
          {row("Verticals · countries", <div className="flex flex-wrap items-center gap-1">{chips(client.verticals)}<span className="ms-1">{client.regions.map((r) => FLAG[r]).join(" ")}</span></div>)}
          {row("Pains solved", chips(client.icp.pains))}
          {row("Deal size", client.icp.deal_size ?? <span className="text-ink-3">—</span>)}
          {row("Proof points", <ul className="grid gap-1">{client.proofPoints.map((p) => <li key={p} dir="auto">· {p}</li>)}{!client.proofPoints.length && <span className="text-ink-3">—</span>}</ul>)}
          {row("Never say", chips(client.noGoClaims, "bad"))}
          {row("Tone · languages", <span>{client.tone ?? "—"} · {client.languages.map((l) => (l === "ar" ? "Arabic" : "English")).join(", ")}</span>)}
        </dl>
      </CardBody>
    </Card>
  );
}

function Inputs({ data }: { data: BrainData }) {
  const c = data.client;
  const inv = [["brain", c.id], ["clients"]];
  const [url, setUrl] = React.useState(c.website ?? "");
  const crawl = useAction(() => api<{ pages: number; caseStudies: number }>(`/clients/${c.id}/brain/crawl`, { method: "POST", json: { url } }), {
    invalidate: inv,
    success: (o) => `Read ${o.pages} pages${o.caseStudies ? ` · found ${o.caseStudies} case studies to approve` : ""}`,
  });
  const [form, setForm] = React.useState({ sellTo: c.icp.notes ?? "", targetTitles: c.icp.titles ?? [], dealSize: c.icp.deal_size ?? "", pains: c.icp.pains ?? [], proof: "", neverSay: c.noGoClaims, languages: c.languages.length ? c.languages : ["en"] });
  const submit = useAction(() => api(`/clients/${c.id}/brain/form`, { method: "POST", json: form }), { invalidate: inv, success: "Onboarding answers saved to the brain" });
  const crm = useAction(() => api<{ url?: string; comingSoon?: boolean }>(`/clients/${c.id}/brain/crm/hubspot`, { method: "POST" }), {
    onSuccess: (o) => (o.url ? (window.location.href = o.url) : undefined),
  });
  const crmEntries = data.entries.filter((e) => e.kind === "crm");
  const lastCrawl = data.entries.find((e) => e.kind === "website");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Globe className="size-4 text-ink-3" /> Website crawl</span>} description="Reads the homepage and up to 10 internal pages, respecting robots.txt." />
        <CardBody>
          <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), crawl.mutate())}>
            <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://client.ae" />
            <Button variant="primary" loading={crawl.isPending}><Sparkles /> Crawl</Button>
          </form>
          {crawl.isPending && <p className="mt-2 text-[12px] text-ink-3">Reading pages and extracting the offer, ICP, proof and case studies… this takes up to a minute.</p>}
          {lastCrawl && (
            <p className="mt-3 text-[12px] text-ink-3">
              Last crawl {timeAgo(lastCrawl.createdAt)} · {(lastCrawl.meta.pages as string[] | undefined)?.length ?? 1} pages
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Building2 className="size-4 text-ink-3" /> CRM</span>} description="Import won deals and their industries from HubSpot." />
        <CardBody>
          {data.crm.hubspot ? (
            <Button loading={crm.isPending} onClick={() => crm.mutate()}>Connect HubSpot</Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button disabled>Connect HubSpot</Button>
              <Badge>Coming soon</Badge>
            </div>
          )}
          {crmEntries.length > 0 && (
            <ul className="mt-3 grid gap-1 text-[12.5px] text-ink-2">
              {crmEntries.slice(0, 8).map((e) => <li key={e.id} dir="auto">· {e.content}</li>)}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title={<span className="flex items-center gap-2"><ListChecks className="size-4 text-ink-3" /> Onboarding form</span>} description="The client's own words. Merged into the profile; it never overwrites edits." />
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), submit.mutate())}>
            <Field label="Who do you sell to?" className="sm:col-span-2"><Textarea dir="auto" required value={form.sellTo} onChange={(e) => setForm({ ...form, sellTo: e.target.value })} rows={2} placeholder="HR leaders at 200–2,000 person companies in UAE and KSA that are hiring fast" /></Field>
            <Field label="Target titles"><TagInput value={form.targetTitles} onChange={(v) => setForm({ ...form, targetTitles: v })} placeholder="HR Director" /></Field>
            <Field label="Typical deal size"><Input value={form.dealSize} onChange={(e) => setForm({ ...form, dealSize: e.target.value })} placeholder="USD 25k–80k ARR" /></Field>
            <Field label="Top 3 pains you solve"><TagInput value={form.pains} onChange={(v) => setForm({ ...form, pains: v.slice(0, 3) })} /></Field>
            <Field label="Words to never use"><TagInput value={form.neverSay} onChange={(v) => setForm({ ...form, neverSay: v })} placeholder="guaranteed, cheapest" /></Field>
            <Field label="Proof (one per line)" hint="Numbers here may be used in emails."><Textarea dir="auto" value={form.proof} onChange={(e) => setForm({ ...form, proof: e.target.value })} rows={3} /></Field>
            <Field label="Languages">
              <div className="flex gap-3 pt-1 text-[13px]">
                {(["en", "ar"] as const).map((l) => (
                  <label key={l} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={form.languages.includes(l)} onChange={(e) => setForm({ ...form, languages: e.target.checked ? [...form.languages, l] : form.languages.filter((x) => x !== l) })} />
                    {l === "en" ? "English" : "العربية"}
                  </label>
                ))}
              </div>
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button variant="primary" loading={submit.isPending}>Save to brain</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

const EMPTY_CS = { customerName: "", customerVertical: "", customerCountry: "", customerSizeBand: "", problem: "", solution: "", resultMetric: "", resultValue: "", timeframe: "", quote: "", quotePersonTitle: "", canNameCustomer: false, language: "en", approved: false };

function CaseStudyForm({ clientId, initial, onDone }: { clientId: string; initial?: CaseStudy; onDone: () => void }) {
  const [f, setF] = React.useState<typeof EMPTY_CS>(initial ? { ...EMPTY_CS, ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ""])) } as typeof EMPTY_CS : EMPTY_CS);
  const save = useAction(() => (initial ? api(`/case-studies/${initial.id}`, { method: "PATCH", json: f }) : api(`/clients/${clientId}/case-studies`, { method: "POST", json: f })), {
    invalidate: [["brain", clientId]],
    success: "Case study saved",
    onSuccess: onDone,
  });
  const t = (k: keyof typeof EMPTY_CS, label: string, area = false, span = false) => (
    <Field label={label} className={span ? "sm:col-span-2" : ""}>
      {area ? <Textarea dir="auto" rows={2} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <Input dir="auto" value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </Field>
  );
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      {t("customerName", "Customer")}
      {t("customerVertical", "Vertical")}
      {t("customerCountry", "Country")}
      {t("customerSizeBand", "Size band")}
      {t("problem", "Problem", true, true)}
      {t("solution", "Solution", true, true)}
      {t("resultMetric", "Result (as it may appear in an email)", false, true)}
      {t("resultValue", "Headline number")}
      {t("timeframe", "Timeframe")}
      {t("quote", "Quote", true, true)}
      {t("quotePersonTitle", "Quote by (title)")}
      <Field label="Language">
        <Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
          <option value="en">English</option>
          <option value="ar">Arabic</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
        <Switch checked={f.canNameCustomer} onCheckedChange={(v) => setF({ ...f, canNameCustomer: v })} /> We may name this customer
        <span className="text-ink-3">(otherwise the writer anonymises: "a Dubai logistics company with 200 staff")</span>
      </label>
      <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
        <Switch checked={f.approved} onCheckedChange={(v) => setF({ ...f, approved: v })} /> Approved for use in emails
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" loading={save.isPending}>Save</Button>
      </div>
    </form>
  );
}

function CaseStudies({ data }: { data: BrainData }) {
  const id = data.client.id;
  const inv = [["brain", id]];
  const [dialog, setDialog] = React.useState<"form" | "url" | "upload" | CaseStudy | null>(null);
  const [url, setUrl] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const approve = useAction(({ cs, v }: { cs: CaseStudy; v: boolean }) => api(`/case-studies/${cs.id}`, { method: "PATCH", json: { approved: v } }), { invalidate: inv });
  const remove = useAction((cs: CaseStudy) => api(`/case-studies/${cs.id}`, { method: "DELETE" }), { invalidate: inv, success: "Removed" });
  const fromUrl = useAction(() => api<unknown[]>(`/clients/${id}/case-studies/url`, { method: "POST", json: { url } }), { invalidate: inv, success: (o) => `Extracted ${o.length} — review and approve`, onSuccess: () => setDialog(null) });
  const upload = useAction(
    async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api<unknown[]>(`/clients/${id}/case-studies/upload`, { method: "POST", body });
    },
    { invalidate: inv, success: (o) => `Extracted ${o.length} from the file — review and approve` },
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setDialog("form")}><Plus /> Add by form</Button>
        <Button onClick={() => fileRef.current?.click()} loading={upload.isPending}><FileUp /> Upload PDF / DOCX / slides</Button>
        <Button onClick={() => setDialog("url")}><Link2 /> From a URL</Button>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
        <span className="ms-auto text-[12px] text-ink-3">The writer only uses <BadgeCheck className="inline size-3.5 text-good" /> approved case studies.</span>
      </div>
      {data.caseStudies.length === 0 ? (
        <Empty icon={<BadgeCheck />} title="No case studies yet">Proof-led variants need at least one approved case study. They're also extracted automatically from the website crawl.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.caseStudies.map((cs) => (
            <Card key={cs.id} className={cn("flex flex-col p-4", !cs.approved && "border-dashed")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div dir="auto" className="truncate text-[14px] font-semibold">{cs.customerName}</div>
                  <div className="text-[12px] text-ink-3">{[cs.customerVertical, cs.customerCountry, cs.customerSizeBand].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                {cs.approved ? <Badge tone="good"><BadgeCheck /> Approved</Badge> : <Badge tone="warm">Needs approval</Badge>}
              </div>
              {cs.resultMetric && (
                <p dir="auto" className="mt-3 text-[15px] font-semibold leading-snug tracking-tight">{cs.resultMetric}</p>
              )}
              {cs.problem && <p dir="auto" className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-2">{cs.problem}</p>}
              <div className="mt-3 flex flex-wrap gap-1">
                <Badge tone="outline">{cs.source}</Badge>
                <Badge tone="outline">{cs.language === "ar" ? "Arabic" : "English"}</Badge>
                {!cs.canNameCustomer && <Badge tone="outline">anonymised</Badge>}
              </div>
              <div className="mt-auto flex items-center gap-1 pt-4">
                <label className="flex items-center gap-2 text-[12.5px]">
                  <Switch checked={cs.approved} onCheckedChange={(v) => approve.mutate({ cs, v })} /> Approved
                </label>
                <Button size="icon-sm" variant="ghost" className="ms-auto" onClick={() => setDialog(cs)} aria-label="Edit"><Pencil /></Button>
                <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(cs)} aria-label="Delete"><Trash2 /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={dialog === "form" || typeof dialog === "object" && dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={typeof dialog === "object" && dialog ? "Edit case study" : "Add a case study"} wide>
          <CaseStudyForm clientId={id} initial={typeof dialog === "object" && dialog ? dialog : undefined} onDone={() => setDialog(null)} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "url"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Case study from a URL" description="We read the page and extract the fields. You approve before the writer can use it.">
          <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), fromUrl.mutate())}>
            <Input type="url" required autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://client.ae/customers/…" />
            <Button variant="primary" loading={fromUrl.isPending}>Extract</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Learnings({ data }: { data: BrainData }) {
  if (!data.learnings.length) {
    return <Empty icon={<Lightbulb />} title="Nothing learned yet">Every reply — positive, neutral, negative, out-of-office or unsubscribe — becomes a learning. The writer reads the last 50 before drafting.</Empty>;
  }
  const counts = data.learnings.reduce<Record<string, number>>((acc, l) => ((acc[l.meta.reply_class] = (acc[l.meta.reply_class] ?? 0) + 1), acc), {});
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(counts).map(([k, n]) => (
          <Badge key={k} tone={REPLY_TONE[k]} className="text-[12px]">{n} {k}</Badge>
        ))}
      </div>
      <Card className="divide-y">
        {data.learnings.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <Badge tone={REPLY_TONE[l.meta.reply_class]}>{l.meta.reply_class}</Badge>
            <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] font-medium">"{l.meta.subject}"</span>
            <span className="text-[12px] text-ink-3">{[String(l.meta.signal_key ?? "").replace(/_/g, " "), l.meta.persona, l.meta.vertical, l.meta.language === "ar" ? "Arabic" : null].filter(Boolean).join(" · ")}</span>
            <span className="num text-[12px] text-ink-3">score {l.meta.score ?? "–"}</span>
            <span className="text-[11.5px] text-ink-3">{timeAgo(l.createdAt)}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

export function BrainPage({ clientId: forced }: { clientId?: string }) {
  const { clientId, clients, setClientId } = useSession();
  const search = new URLSearchParams(useSearch());
  const id = forced ?? clientId ?? clients[0]?.id ?? null;
  const q = useApi<BrainData>(["brain", id], id ? `/clients/${id}/brain` : null);
  React.useEffect(() => {
    if (forced && forced !== clientId) setClientId(forced);
  }, [forced]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) {
    return (
      <>
        <PageHeader title="Brain" />
        <Empty icon={<Building2 />} title="Add your first client" action={<Button variant="primary" asChild><Link href="/settings/clients?new=1">Add client</Link></Button>}>Each client gets a brain: their offer, ICP, proof, case studies and what we've learned.</Empty>
      </>
    );
  }
  const d = q.data;
  const pending = d?.caseStudies.filter((c) => !c.approved).length ?? 0;
  return (
    <>
      <PageHeader
        eyebrow="Brain"
        title={d?.client.name ?? " "}
        description="Everything the writer knows about this client. Numbers in emails can only come from here or from approved case studies."
        actions={!clientId && clients.length > 1 && <span className="text-[12px] text-ink-3">Showing the first client · switch in the sidebar</span>}
      />
      {search.get("crm") && <p className="mb-4 rounded-lg bg-good-soft px-3 py-2 text-[13px] text-good">Imported {search.get("crm")} won deals from HubSpot.</p>}
      {!d ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <Tabs defaultValue="profile">
          <TabsList className="mb-4">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            <TabsTrigger value="cases">Case studies {pending > 0 && <span className="num rounded bg-warm px-1 text-[10.5px] text-white">{pending}</span>}</TabsTrigger>
            <TabsTrigger value="learned">What we've learned</TabsTrigger>
          </TabsList>
          <TabsContent value="profile"><ProfileCard client={d.client} /></TabsContent>
          <TabsContent value="inputs"><Inputs data={d} /></TabsContent>
          <TabsContent value="cases"><CaseStudies data={d} /></TabsContent>
          <TabsContent value="learned"><Learnings data={d} /></TabsContent>
        </Tabs>
      )}
    </>
  );
}
