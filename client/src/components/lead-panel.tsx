import { ArrowLeftRight, Ban, CalendarClock, Check, ExternalLink, Loader2, Pencil, RefreshCw, Send, SkipForward, Sparkles, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { api, useAction, useApi, type Draft, type Lead, type Send as SendRow } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn, dateTime, FLAG, isArabic, timeAgo } from "@/lib/utils";
import { ScoreBreakdown, ScoreRing, SignalChip, Thermometer } from "./heat";
import { SimulatedInbox } from "./inbox";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, Sheet } from "./ui/dialog";
import { Input, Textarea } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "./ui/misc";

type Detail = { lead: Lead; account: { fitReason: string | null; fit: number } | null; drafts: Draft[]; presentedDraftId: string | null; sends: (SendRow & { approver: string | null })[] };

const ANGLE: Record<string, string> = { outcome: "Outcome-led", signal: "Signal-led", proof: "Proof-led" };
const REPLY_TONE: Record<string, "good" | "neutral" | "bad" | "warm"> = { positive: "good", neutral: "neutral", negative: "bad", ooo: "warm", unsubscribe: "bad" };

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function EmailEditor({ draft, editable, onSaved }: { draft: Draft; editable: boolean; onSaved: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [subject, setSubject] = React.useState(draft.subject);
  const [body, setBody] = React.useState(draft.body);
  React.useEffect(() => {
    setSubject(draft.subject);
    setBody(draft.body);
    setEditing(false);
  }, [draft.id, draft.subject, draft.body]);
  const save = useAction(
    async () => {
      await api(`/drafts/${draft.id}`, { method: "PATCH", json: { subject, body } });
      return api(`/drafts/${draft.id}/simulate`, { method: "POST" });
    },
    { success: "Saved and re-simulated", onSuccess: () => (setEditing(false), onSaved()) },
  );
  const words = wordCount(body);
  return (
    <div className="overflow-hidden rounded-xl border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b bg-surface-2/60 px-4 py-2">
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          <Badge tone="outline">Variant {draft.variant}</Badge>
          <span>{ANGLE[draft.angle]}</span>
          {draft.play && <span className="hidden sm:inline">· Play: {draft.play.name}</span>}
        </div>
        {editable &&
          (editing ? (
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setSubject(draft.subject), setBody(draft.body))}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                Save & re-simulate
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          ))}
      </div>
      <div className="px-4 py-3">
        {editing ? (
          <div className="grid gap-2">
            <Input dir="auto" value={subject} onChange={(e) => setSubject(e.target.value)} className="font-medium" />
            <Textarea dir="auto" value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="text-[13.5px]" />
            <p className={cn("text-end text-[11.5px]", words > 120 ? "text-bad" : "text-ink-3")}>{words} words · keep under 120</p>
          </div>
        ) : (
          <>
            <div dir="auto" className="text-[14.5px] font-semibold tracking-tight">{draft.subject}</div>
            <div dir="auto" className={cn("mt-3 whitespace-pre-wrap text-[13.5px] leading-[1.65] text-ink", isArabic(draft.body) && "text-[14.5px] leading-[1.9]")}>
              {draft.body}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-3 text-[11.5px] text-ink-3">
              <span>{words} words</span>
              {draft.caseStudy && (
                <Badge tone="neutral">
                  Case study: {draft.caseStudy.customerName}
                  {!draft.caseStudy.canNameCustomer && " (anonymised)"}
                </Badge>
              )}
              {draft.violations.map((v) => (
                <Tooltip key={v} content="Fixed automatically by the writer's hard rules">
                  <Badge tone="warm">{v}</Badge>
                </Tooltip>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmSend({ draft, lead, open, onOpenChange, onSent }: { draft: Draft; lead: Lead; open: boolean; onOpenChange: (o: boolean) => void; onSent: () => void }) {
  const send = useAction(() => api<{ scheduledFor: string }>(`/drafts/${draft.id}/send`, { method: "POST", json: { confirm: true } }), {
    invalidate: [["review"], ["leads"], ["clients"], ["sends"], ["dashboard"]],
    success: (o) => `Approved — sending ${timeAgo(o.scheduledFor)}`,
    onSuccess: () => (onOpenChange(false), onSent()),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Approve and send?" description="This sends from the client's own mailbox. You're the human approving it — it's logged.">
        <div className="rounded-xl border bg-surface-2/60 p-3 text-[13px]">
          <div className="text-ink-3">To</div>
          <div className="font-medium">
            {lead.fullName} · {lead.email}
          </div>
          <div className="mt-2 text-ink-3">Subject</div>
          <div dir="auto" className="font-medium">{draft.subject}</div>
        </div>
        <ul className="mt-3 grid gap-1 text-[12.5px] text-ink-2">
          <li className="flex gap-2"><Check className="size-3.5 text-good" /> Queued with a 2–6 minute gap, inside the daily cap</li>
          <li className="flex gap-2"><Check className="size-3.5 text-good" /> List-Unsubscribe header + opt-out line</li>
          <li className="flex gap-2"><Check className="size-3.5 text-good" /> Re-checked against suppression right before sending</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="hot" loading={send.isPending} onClick={() => send.mutate()}>
            <Send /> Approve & send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LeadPanel({ leadId, open, onOpenChange }: { leadId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { isStaff } = useSession();
  const q = useApi<Detail>(["lead", leadId], leadId ? `/leads/${leadId}` : null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("email");
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => {
    setSelected(null);
    setTab("email");
  }, [leadId]);

  const d = q.data;
  const draft = d?.drafts.find((x) => x.id === (selected ?? d.presentedDraftId)) ?? d?.drafts[0];
  const refresh = () => q.refetch();
  const inv = [["review"], ["leads"], ["clients"], ["dashboard"], ["lead", leadId]];
  const choose = useAction((id: string) => api(`/drafts/${id}/choose`, { method: "POST" }), { invalidate: inv, success: "Variant swapped" });
  const skip = useAction(() => api(`/leads/${leadId}/skip`, { method: "POST" }), { invalidate: inv, success: "Skipped", onSuccess: () => onOpenChange(false) });
  const suppress = useAction((scope: "email" | "domain") => api(`/leads/${leadId}/suppress`, { method: "POST", json: { scope } }), { invalidate: inv, success: "Contact suppressed", onSuccess: () => onOpenChange(false) });
  const regenerate = useAction(() => api(`/leads/${leadId}/generate`, { method: "POST" }), { invalidate: inv, success: "Drafts written and simulated" });
  const classify = useAction(({ id, replyClass }: { id: string; replyClass: string }) => api(`/sends/${id}`, { method: "PATCH", json: { replyClass } }), { invalidate: inv, success: "Reply logged" });
  const meeting = useAction(({ id, v }: { id: string; v: boolean }) => api(`/sends/${id}`, { method: "PATCH", json: { meetingBooked: v } }), { invalidate: inv });
  const cancel = useAction((id: string) => api(`/sends/${id}/cancel`, { method: "POST" }), { invalidate: inv, success: "Send cancelled" });

  const canSend = isStaff && d && d.lead.status === "ready" && draft && !["approved", "sent"].includes(draft.status) && !d.sends.some((s) => s.status === "scheduled" || s.status === "sent");

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Lead">
      {!d ? (
        <div className="grid flex-1 place-items-center text-ink-3">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex items-start gap-4 border-b bg-surface px-5 py-4">
            <Thermometer score={d.lead.tempScore} temperature={d.lead.temperature} size="lg" showLabel={false} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 dir="auto" className="text-[17px] font-semibold tracking-tight">{d.lead.fullName ?? "Contact"}</h2>
                <Badge tone={d.lead.temperature}>{d.lead.temperature} · {d.lead.tempScore}</Badge>
                {d.lead.abGroup === "challenger" && (
                  <Tooltip content="This lead is in the 10% A/B group: the second-best variant is presented, to calibrate the score against real replies.">
                    <Badge tone="outline">A/B challenger</Badge>
                  </Tooltip>
                )}
              </div>
              <p dir="auto" className="mt-0.5 truncate text-[13px] text-ink-2">
                {d.lead.title} · {d.lead.company.name} {FLAG[d.lead.company.country ?? ""] ?? ""}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-ink-3">
                {d.lead.email}
                {d.lead.emailVerified && ` · ${d.lead.emailVerified === "verified" ? "verified" : d.lead.emailVerified}`}
                {d.lead.linkedinUrl && (
                  <a href={d.lead.linkedinUrl} target="_blank" rel="noreferrer" className="ms-2 inline-flex items-center gap-0.5 hover:text-ink">
                    LinkedIn <ExternalLink className="size-3" />
                  </a>
                )}
              </p>
            </div>
            <button onClick={() => onOpenChange(false)} className="rounded-md p-1 text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label="Close">
              <X className="size-4.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="mb-4 rounded-xl border bg-surface p-3.5 shadow-card">
              <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Why now</div>
              <p dir="auto" className="mt-1 text-[13.5px]">{d.lead.whyNow ?? "—"}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {d.lead.signals.map((s) => (
                  <SignalChip key={s.id} s={s} />
                ))}
              </div>
            </div>

            {d.drafts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <p className="text-[13.5px] font-medium">No drafts yet</p>
                <p className="mt-1 text-[12.5px] text-ink-3">{d.lead.temperature === "cold" ? "Cold leads stay on the watchlist. You can still write to them." : "Drafts are written automatically for warm and hot leads."}</p>
                {isStaff && (
                  <Button className="mt-4" variant="primary" loading={regenerate.isPending} onClick={() => regenerate.mutate()}>
                    <Sparkles /> Write 3 variants & simulate
                  </Button>
                )}
              </div>
            ) : (
              <Tabs value={tab} onValueChange={setTab}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <TabsList>
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="inbox">Simulated inbox</TabsTrigger>
                    <TabsTrigger value="score">Thermometer</TabsTrigger>
                    {d.sends.length > 0 && <TabsTrigger value="sends">Sent</TabsTrigger>}
                  </TabsList>
                  {isStaff && !["sent", "replied"].includes(d.lead.status) && (
                    <Button size="sm" variant="ghost" loading={regenerate.isPending} onClick={() => regenerate.mutate()}>
                      <RefreshCw /> Rewrite all
                    </Button>
                  )}
                </div>

                <div className="mb-3 grid grid-cols-3 gap-2">
                  {d.drafts.map((x) => {
                    const active = x.id === draft?.id;
                    const presented = x.id === d.presentedDraftId;
                    return (
                      <button
                        key={x.id}
                        onClick={() => setSelected(x.id)}
                        className={cn("flex items-center gap-2.5 rounded-xl border bg-surface p-2.5 text-start shadow-card transition", active ? "border-ink/40 ring-3 ring-ink/5" : "hover:border-line-2")}
                      >
                        <ScoreRing score={x.score} size={38} />
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-medium">{ANGLE[x.angle]}</span>
                          <span className="block truncate text-[11px] text-ink-3">
                            {presented ? "Will send" : x.status === "winner" ? "Winner" : `Variant ${x.variant}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {draft && (
                  <>
                    <TabsContent value="email" className="grid gap-3">
                      <EmailEditor draft={draft} editable={isStaff && !["approved", "sent"].includes(draft.status)} onSaved={refresh} />
                    </TabsContent>
                    <TabsContent value="inbox">
                      <SimulatedInbox draft={draft} fromName={d.lead.clientName} />
                    </TabsContent>
                  </>
                )}
                <TabsContent value="score">
                  <div className="rounded-xl border bg-surface p-4 shadow-card">
                    {d.lead.breakdown ? <ScoreBreakdown breakdown={d.lead.breakdown} /> : <p className="text-ink-3">No score yet.</p>}
                    {d.account?.fitReason && <p className="mt-3 border-t pt-3 text-[12.5px] text-ink-2">ICP fit: {d.account.fitReason}</p>}
                  </div>
                </TabsContent>
                <TabsContent value="sends" className="grid gap-2">
                  {d.sends.map((s) => (
                    <div key={s.id} className="rounded-xl border bg-surface p-3.5 shadow-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone={s.status === "sent" ? "good" : s.status === "scheduled" ? "warm" : "bad"}>{s.status}</Badge>
                          <span className="text-[12.5px] text-ink-2">
                            {s.status === "scheduled" ? <><CalendarClock className="inline size-3.5" /> {dateTime(s.scheduledFor)}</> : dateTime(s.sentAt ?? s.scheduledFor)}
                          </span>
                        </div>
                        <span className="text-[11.5px] text-ink-3">Approved by {s.approver}</span>
                      </div>
                      <p dir="auto" className="mt-2 text-[13px] font-medium">{s.subject}</p>
                      {s.error && <p className="mt-1 text-[12px] text-bad">{s.error}</p>}
                      {s.replyText && <p dir="auto" className="mt-2 rounded-lg bg-surface-2 p-2.5 text-[12.5px] text-ink-2">“{s.replyText}”</p>}
                      {isStaff && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {s.status === "scheduled" && (
                            <Button size="sm" variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(s.id)}>
                              Cancel send
                            </Button>
                          )}
                          {s.status === "sent" && (
                            <>
                              <span className="text-[11.5px] text-ink-3">Reply:</span>
                              {["positive", "neutral", "negative", "ooo", "unsubscribe"].map((c) => (
                                <button key={c} onClick={() => classify.mutate({ id: s.id, replyClass: c })} className={cn("rounded-md px-2 py-0.5 text-[11.5px] transition", s.replyClass === c ? "bg-primary text-primary-ink" : "bg-surface-3 text-ink-2 hover:text-ink")}>
                                  {c}
                                </button>
                              ))}
                              <label className="ms-auto flex items-center gap-1.5 text-[12px] text-ink-2">
                                <input type="checkbox" checked={s.meetingBooked} onChange={(e) => meeting.mutate({ id: s.id, v: e.target.checked })} /> Meeting booked
                              </label>
                            </>
                          )}
                          {s.replyClass && <Badge tone={REPLY_TONE[s.replyClass]}>{s.replyClass}</Badge>}
                        </div>
                      )}
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            )}
          </div>

          {isStaff && draft && d.lead.status !== "closed" && (
            <div className="flex flex-wrap items-center gap-2 border-t bg-surface px-5 py-3">
              <Button variant="ghost" size="sm" onClick={() => skip.mutate()} loading={skip.isPending}>
                <SkipForward /> Skip
              </Button>
              <Button variant="ghost" size="sm" onClick={() => suppress.mutate("email")} loading={suppress.isPending}>
                <Ban /> Suppress contact
              </Button>
              {draft.id !== d.presentedDraftId && canSend && (
                <Button variant="outline" size="sm" onClick={() => choose.mutate(draft.id)} loading={choose.isPending}>
                  <ArrowLeftRight /> Use this variant
                </Button>
              )}
              <div className="ms-auto flex items-center gap-2">
                {canSend ? (
                  <Button variant="hot" onClick={() => (draft.id !== d.presentedDraftId ? toast.message("Sending the variant you're viewing") : null, setConfirm(true))}>
                    <Send /> Approve & send
                  </Button>
                ) : (
                  <span className="text-[12px] text-ink-3">{d.sends.length ? "Already approved" : d.lead.status !== "ready" ? "Not ready to send" : ""}</span>
                )}
              </div>
            </div>
          )}
          {draft && <ConfirmSend draft={draft} lead={d.lead} open={confirm} onOpenChange={setConfirm} onSent={refresh} />}
        </>
      )}
    </Sheet>
  );
}
