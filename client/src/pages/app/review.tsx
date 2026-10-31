import { CalendarClock, Inbox, Send } from "lucide-react";
import * as React from "react";
import { useSearch } from "wouter";
import { ScoreRing, SignalChip, Thermometer } from "@/components/heat";
import { LeadPanel } from "@/components/lead-panel";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, Skeleton, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from "@/components/ui/misc";
import { useApi, type Lead, type Send as SendRow } from "@/lib/api";
import { useClientQuery, useSession } from "@/lib/session";
import { cn, dateTime, FLAG, isArabic, timeAgo } from "@/lib/utils";

type ReviewRow = Lead & { draft: { id: string; subject: string; body: string; score: number | null; scoreBefore: number | null; angle: string; language: string; variant: number } | null };
type SentRow = SendRow & { lead: { id: string; fullName: string | null; title: string | null; temperature: "hot" | "warm" | "cold"; tempScore: number }; company: string };

const preview = (body: string) => body.split("\n").map((l) => l.trim()).filter(Boolean).slice(1, 3).join(" ");
const REPLY_TONE: Record<string, "good" | "neutral" | "bad" | "warm"> = { positive: "good", neutral: "neutral", negative: "bad", ooo: "warm", unsubscribe: "bad" };

export function ReviewPage() {
  const { client, isStaff } = useSession();
  const qs = useClientQuery();
  const search = new URLSearchParams(useSearch());
  const ready = useApi<ReviewRow[]>(["review", qs], `/review${qs}`);
  const sent = useApi<SentRow[]>(["sends", qs], `/sends${qs}`);
  const [open, setOpen] = React.useState<string | null>(search.get("lead"));
  const rows = ready.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow={client?.name ?? "All clients"}
        title="Review & Send"
        description={isStaff ? "Each email was written from a real signal and tested on a simulated inbox. Nothing is sent until someone here clicks Approve & send." : "Emails your agency has prepared for you, and what's been sent."}
      />
      <Tabs defaultValue="ready">
        <TabsList className="mb-4">
          <TabsTrigger value="ready">
            Ready {rows.length > 0 && <span className="num rounded bg-hot px-1 text-[10.5px] text-white">{rows.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="sent">Scheduled & sent</TabsTrigger>
        </TabsList>

        <TabsContent value="ready">
          {ready.isLoading ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : rows.length === 0 ? (
            <Empty icon={<Inbox />} title="Inbox zero">New emails appear here as soon as a warm or hot lead has its drafts written and simulated.</Empty>
          ) : (
            <>
              <Card className="hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <Th className="w-24">Heat</Th>
                      <Th>Lead</Th>
                      <Th>Why now</Th>
                      <Th>Email</Th>
                      <Th className="w-16 text-center">Score</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} onClick={() => setOpen(r.id)} className="cursor-pointer transition hover:bg-surface-2/70">
                        <Td>
                          <Thermometer score={r.tempScore} temperature={r.temperature} breakdown={r.breakdown} />
                        </Td>
                        <Td className="max-w-52">
                          <div dir="auto" className="truncate font-semibold">{r.fullName}</div>
                          <div dir="auto" className="truncate text-[12px] text-ink-3">{r.title}</div>
                          <div className="truncate text-[12px] text-ink-2">{r.company.name} {FLAG[r.company.country ?? ""]}</div>
                        </Td>
                        <Td className="max-w-64">
                          <p dir="auto" className="line-clamp-2 text-[12.5px] text-ink-2">{r.whyNow}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {r.signals.slice(0, 2).map((s) => (
                              <SignalChip key={s.id} s={s} compact />
                            ))}
                          </div>
                        </Td>
                        <Td className="max-w-80">
                          {r.draft && (
                            <>
                              <div dir="auto" className="truncate font-medium">{r.draft.subject}</div>
                              <p dir="auto" className={cn("line-clamp-2 text-[12px] text-ink-3", isArabic(r.draft.body) && "text-[12.5px]")}>{preview(r.draft.body)}</p>
                            </>
                          )}
                        </Td>
                        <Td className="text-center">
                          <ScoreRing score={r.draft?.score ?? null} size={40} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
              <div className="grid gap-2 md:hidden">
                {rows.map((r) => (
                  <button key={r.id} onClick={() => setOpen(r.id)} className="rounded-xl border bg-surface p-3.5 text-start shadow-card">
                    <div className="flex items-center gap-3">
                      <Thermometer score={r.tempScore} temperature={r.temperature} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{r.company.name}</div>
                        <div dir="auto" className="truncate text-[12px] text-ink-3">{r.fullName} · {r.title}</div>
                      </div>
                      <ScoreRing score={r.draft?.score ?? null} size={36} />
                    </div>
                    {r.draft && <div dir="auto" className="mt-2 truncate text-[12.5px] font-medium">{r.draft.subject}</div>}
                  </button>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="sent">
          {(sent.data ?? []).length === 0 ? (
            <Empty icon={<Send />} title="Nothing sent yet">Approved emails show here with their schedule, replies and meetings.</Empty>
          ) : (
            <Card>
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>To</Th>
                    <Th>Subject</Th>
                    <Th>Status</Th>
                    <Th>Reply</Th>
                    <Th>Approved by</Th>
                  </tr>
                </thead>
                <tbody>
                  {sent.data!.map((s) => (
                    <tr key={s.id} onClick={() => setOpen(s.lead.id)} className="cursor-pointer hover:bg-surface-2/70">
                      <Td className="whitespace-nowrap text-[12.5px] text-ink-2">
                        {s.status === "scheduled" ? (
                          <span className="inline-flex items-center gap-1 text-warm"><CalendarClock className="size-3.5" />{dateTime(s.scheduledFor)}</span>
                        ) : (
                          timeAgo(s.sentAt ?? s.scheduledFor)
                        )}
                      </Td>
                      <Td>
                        <div className="font-medium">{s.company}</div>
                        <div dir="auto" className="text-[12px] text-ink-3">{s.lead.fullName}</div>
                      </Td>
                      <Td dir="auto" className="max-w-72 truncate">{s.subject}</Td>
                      <Td>
                        <Badge tone={s.status === "sent" ? "good" : s.status === "scheduled" ? "warm" : s.status === "cancelled" ? "neutral" : "bad"}>{s.status}</Badge>
                      </Td>
                      <Td>
                        {s.replyClass ? <Badge tone={REPLY_TONE[s.replyClass]}>{s.replyClass}</Badge> : <span className="text-ink-3">—</span>}
                        {s.meetingBooked && <Badge tone="ink" className="ms-1">meeting</Badge>}
                      </Td>
                      <Td className="text-[12px] text-ink-3">{s.approver}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      <LeadPanel leadId={open} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}
