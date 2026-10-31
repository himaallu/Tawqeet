import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReviewQueue, getGetReviewQueueQueryKey, useApproveAndSendDraft, useMarkSendReply,
  type ReviewItem, type ReplyInputReplyClass,
} from "@workspace/api-client-react";
import { Send, ShieldAlert, CheckCircle2, Mail, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorPanel, PageHeader } from "@/components/states";
import { SimulatedInbox, SampleBadge, tempStyle } from "@/components/demo-bits";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

const OPT_OUT = /reply no|won.t follow|unsubscribe|reply .?stop|لن أتابع|توقف|إلغاء الاشتراك/i;
const replies: { key: ReplyInputReplyClass; label: string }[] = [
  { key: "positive", label: "Positive" }, { key: "neutral", label: "Neutral" },
  { key: "negative", label: "Negative" }, { key: "unsubscribe", label: "Unsubscribe" },
];

export default function ReviewPage() {
  const q = useGetReviewQueue({ query: { queryKey: getGetReviewQueueQueryKey() } });
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = q.data?.items.find((i) => i.leadId === openId) ?? null;

  return (
    <div className="rise">
      <PageHeader eyebrow="Workspace" title="Review & Send">
        {q.data && <span className="rounded-md border bg-card px-3 py-1.5 font-mono text-sm" data-testid="text-send-cap">Sent today {q.data.sentToday}/{q.data.dailyCap}</span>}
      </PageHeader>
      <div className="mb-5 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm flex gap-2" data-testid="status-demo-recipient">
        <Mail className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <span>Demo mode: approved emails are delivered only to the demo recipient{q.data?.recipient ? <> (<span className="font-mono">{q.data.recipient}</span>)</> : <> — <span className="text-destructive">no recipient configured (set ALERT_EMAIL_TO or OWNER_EMAIL)</span></>}, never to the lead.</span>
      </div>
      {q.isLoading ? <Skeleton className="h-72" /> : q.isError || !q.data ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} /> :
        q.data.items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">No drafts yet. Go to <Link href="/settings" className="text-accent underline">Settings → Load demo data</Link>.</div>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Temp</TableHead><TableHead>Lead</TableHead><TableHead>Company</TableHead>
                <TableHead className="hidden lg:table-cell">Top signal</TableHead><TableHead>Winning subject</TableHead>
                <TableHead className="text-right">Score</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {q.data.items.map((i) => (
                  <TableRow key={i.leadId} className="cursor-pointer" onClick={() => setOpenId(i.leadId)} data-testid={`row-review-${i.leadId}`}>
                    <TableCell><span className={"rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase " + tempStyle[i.temperature]}>{i.temperature} {i.totalScore}</span></TableCell>
                    <TableCell><div dir="auto" className="font-medium">{i.fullName}</div><div className="text-xs text-muted-foreground" dir="auto">{i.title}</div></TableCell>
                    <TableCell>{i.companyName}</TableCell>
                    <TableCell className="hidden lg:table-cell max-w-[220px] truncate text-muted-foreground" title={i.topSignal ?? ""}>{i.topSignal ?? "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate" dir="auto" title={i.subject}>{i.subject}</TableCell>
                    <TableCell className="text-right font-mono">{i.score ?? "—"}</TableCell>
                    <TableCell><StateBadge item={i} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && <ReviewPanel key={selected.leadId} item={selected} recipient={q.data?.recipient ?? null} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StateBadge({ item }: { item: ReviewItem }) {
  if (item.state === "sent") return <span className="inline-flex items-center gap-1 text-xs text-accent"><CheckCircle2 className="h-3.5 w-3.5" />Sent{item.send?.replyClass ? ` · ${item.send.replyClass}` : ""}</span>;
  if (item.state === "blocked") return <span className="inline-flex items-center gap-1 text-xs text-destructive" title={item.blockReason ?? ""}><ShieldAlert className="h-3.5 w-3.5" />Blocked</span>;
  return <span className="text-xs font-mono uppercase text-muted-foreground">Ready</span>;
}

function ReviewPanel({ item, recipient }: { item: ReviewItem; recipient: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const sorted = useMemo(() => [...item.drafts].sort((a, b) => a.variant - b.variant), [item.drafts]);
  const [draftId, setDraftId] = useState(item.winnerDraftId);
  const draft = sorted.find((d) => d.id === draftId) ?? sorted[0]!;
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  useEffect(() => { setSubject(draft.subject); setBody(draft.body); }, [draft.id, draft.subject, draft.body]);
  const send = useApproveAndSendDraft();
  const reply = useMarkSendReply();
  const sent = item.state === "sent";
  const optOutMissing = !OPT_OUT.test(body);
  const refresh = () => qc.invalidateQueries({ queryKey: getGetReviewQueueQueryKey() });

  return (
    <div className="space-y-5">
      <SheetHeader>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{item.companyName} · {item.country}</div>
        <SheetTitle className="font-display text-2xl" dir="auto">{item.fullName}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={"rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase " + tempStyle[item.temperature]}>{item.temperature} {item.totalScore}</span>
            <span dir="auto">{item.title}</span><SampleBadge sample={item.sample} />
            <span className="rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase">{item.email ?? "Demo recipient only"}</span>
            <span className="text-xs text-muted-foreground">Legal basis: {item.legalBasis}</span>
            <Link href={`/leads/${item.leadId}`} className="text-xs text-accent inline-flex items-center gap-1">Lead <ExternalLink className="h-3 w-3" /></Link>
          </div>
        </SheetDescription>
      </SheetHeader>
      {item.topSignal && <p className="text-sm text-muted-foreground border-l-2 border-accent/50 pl-3">{item.topSignal}</p>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Variants">
        {sorted.map((d) => (
          <Button key={d.id} size="sm" variant={d.id === draft.id ? "default" : "outline"} role="tab" aria-selected={d.id === draft.id}
            disabled={sent && d.id !== item.send?.draftId} onClick={() => setDraftId(d.id)} data-testid={`tab-variant-${d.variant}`}>
            Variant {d.variant}{d.id === item.winnerDraftId ? " · winner" : ""}{d.score !== null ? ` · ${d.score}` : ""}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        <div><Label htmlFor="subject" className="text-xs uppercase tracking-wider text-muted-foreground">Subject</Label>
          <Input id="subject" dir="auto" value={subject} disabled={sent} onChange={(e) => setSubject(e.target.value)} className="mt-1.5" data-testid="input-review-subject" /></div>
        <div><Label htmlFor="body" className="text-xs uppercase tracking-wider text-muted-foreground">Body</Label>
          <Textarea id="body" dir="auto" rows={10} value={body} disabled={sent} onChange={(e) => setBody(e.target.value)} className="mt-1.5 leading-relaxed" data-testid="input-review-body" /></div>
        {optOutMissing && !sent && <p className="text-sm text-destructive">Opt-out line is missing; sending is blocked.</p>}
        {item.state === "blocked" && <p className="text-sm text-destructive" data-testid="text-block-reason">Blocked: {item.blockReason}</p>}
      </div>

      {!sent ? (
        <div className="rounded-md border bg-secondary/30 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Sent from client mailbox (demo). Delivered only to <span className="font-mono">{recipient ?? "— not configured"}</span> with subject prefix “[Demo · to {item.email ?? "sample contact"}]”. Your approval is recorded.</p>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" data-testid="button-approve-send"
            disabled={send.isPending || optOutMissing || item.state === "blocked" || !recipient || !subject.trim()}
            onClick={() => send.mutate({ id: draft.id, data: { subject, body } }, {
              onSuccess: (r) => { toast({ title: "Approved & sent", description: r.message }); refresh(); },
              onError: (e) => toast({ title: "Not sent", description: apiErrorMessage(e), variant: "destructive" }),
            })}>
            <Send className="h-4 w-4 mr-2" />{send.isPending ? "Sending" : "Approve & Send"}
          </Button>
        </div>
      ) : (
        <div className="rounded-md border bg-secondary/30 p-4 space-y-3" data-testid="panel-sent">
          <p className="text-sm">Sent {item.send && format(new Date(item.send.sentAt), "d MMM yyyy, HH:mm")} to <span className="font-mono">{item.send?.recipient}</span>{item.send?.approvedBy ? <> · approved by {item.send.approvedBy}</> : null}</p>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Mark reply {item.send?.replyClass && <span className="normal-case text-accent">· current: {item.send.replyClass}</span>}</div>
          <div className="flex flex-wrap gap-2">
            {replies.map((r) => (
              <Button key={r.key} size="sm" variant={item.send?.replyClass === r.key ? "default" : "outline"} disabled={reply.isPending}
                data-testid={`button-reply-${r.key}`}
                onClick={() => reply.mutate({ id: item.send!.id, data: { replyClass: r.key } }, {
                  onSuccess: (m) => { toast({ title: "Reply recorded", description: m.message }); refresh(); },
                  onError: (e) => toast({ title: "Could not record", description: apiErrorMessage(e), variant: "destructive" }),
                })}>{r.label}</Button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-display text-lg mb-2">Simulated inbox</h3>
        <div className="rounded-md border bg-secondary/30 p-4 text-sm"><SimulatedInbox d={draft} /></div>
      </div>
    </div>
  );
}
