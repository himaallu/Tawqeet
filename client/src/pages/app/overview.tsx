import { ArrowRight, Flame, MailCheck, MessageSquareReply, Send } from "lucide-react";
import * as React from "react";
import { Link } from "wouter";
import { SignalChip, Thermometer } from "@/components/heat";
import { LeadPanel } from "@/components/lead-panel";
import { PageHeader, Section, Stat } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, Skeleton } from "@/components/ui/misc";
import { useApi, type Lead } from "@/lib/api";
import { useClientQuery, useSession } from "@/lib/session";
import { FLAG, isArabic, timeAgo } from "@/lib/utils";

type Dashboard = {
  temperatures: Partial<Record<"hot" | "warm" | "cold", number>>;
  ready: number;
  week: { sent: number; replies: number; positive: number; scheduled: number };
  hot: Lead[];
  recentSignals: { id: string; title: string; url: string | null; source: string; name: string; key: string; detectedAt: string; company: string; country: string | null; language: string }[];
};

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", hour12: false }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export function OverviewPage() {
  const { me, client, isStaff } = useSession();
  const qs = useClientQuery();
  const q = useApi<Dashboard>(["dashboard", qs], `/dashboard${qs}`);
  const [open, setOpen] = React.useState<string | null>(null);
  const d = q.data;
  const t = d?.temperatures ?? {};
  const replyRate = d && d.week.sent ? Math.round((d.week.replies / d.week.sent) * 100) : null;
  const firstName = isStaff ? (me.user.name ?? "").split(/[\s(]/)[0] : "";

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", weekday: "long", day: "numeric", month: "long" }) + " · Gulf time"}
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}.`}
        description={d ? (d.ready ? `${d.ready} email${d.ready > 1 ? "s are" : " is"} written, tested and waiting for a human to send${client ? ` for ${client.name}` : ""}.` : "Nothing waiting for review. The radar is watching.") : " "}
        actions={
          d?.ready ? (
            <Button variant="primary" asChild>
              <Link href="/review">
                {isStaff ? "Review & send" : "See emails"} <ArrowRight />
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!d ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        ) : (
          <>
            <Stat label="Hot leads" value={t.hot ?? 0} accent="hot" icon={<Flame />} sub={`${t.warm ?? 0} warm · ${t.cold ?? 0} cold`} />
            <Stat label="Ready to review" value={d.ready} accent="warm" icon={<MailCheck />} sub="Written + simulated" />
            <Stat label="Sent · 7 days" value={d.week.sent} icon={<Send />} sub={d.week.scheduled ? `${d.week.scheduled} scheduled` : "From clients' own mailboxes"} />
            <Stat label="Reply rate · 7 days" value={replyRate === null ? "—" : `${replyRate}%`} accent="good" icon={<MessageSquareReply />} sub={`${d.week.positive} positive`} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Hot right now" action={isStaff && <Link href="/leads" className="text-[12.5px] text-ink-3 hover:text-ink">All leads →</Link>}>
          {!d ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : d.hot.length === 0 ? (
            <Empty icon={<Flame />} title="No hot leads yet">When stacked signals push an account past 70, it shows up here and you're alerted.</Empty>
          ) : (
            <Card className="divide-y">
              {d.hot.map((l) => (
                <button key={l.id} onClick={() => setOpen(l.id)} className="flex w-full items-center gap-4 px-4 py-3 text-start transition hover:bg-surface-2/70">
                  <Thermometer score={l.tempScore} temperature={l.temperature} breakdown={l.breakdown} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold">{l.company.name}</span>
                      <span className="text-[12px]">{FLAG[l.company.country ?? ""]}</span>
                      {!client && <span className="truncate text-[11.5px] text-ink-3">for {l.clientName}</span>}
                    </div>
                    <p dir="auto" className="truncate text-[12.5px] text-ink-2">{l.whyNow}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {l.signals.slice(0, 3).map((s) => (
                        <SignalChip key={s.id} s={s} compact />
                      ))}
                    </div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-ink-3" />
                </button>
              ))}
            </Card>
          )}
        </Section>

        <Section title="Latest signals">
          {!d ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : d.recentSignals.length === 0 ? (
            <Empty title="No signals matched yet">The radar checks news every 30 minutes, careers pages nightly and tenders every morning.</Empty>
          ) : (
            <Card className="px-4 py-2">
              <ol className="relative">
                {d.recentSignals.map((s, i) => (
                  <li key={s.id} className="relative flex gap-3 py-2.5">
                    <span className="relative flex flex-col items-center">
                      <span className="mt-1.5 size-2 rounded-full bg-hot ring-4 ring-hot-soft" />
                      {i < d.recentSignals.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12.5px] font-semibold">{s.company} <span className="font-normal">{FLAG[s.country ?? ""]}</span></span>
                        <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(s.detectedAt)}</span>
                      </div>
                      <p dir="auto" className={isArabic(s.title) ? "text-[13px] leading-relaxed text-ink-2" : "text-[12.5px] leading-snug text-ink-2"}>{s.title}</p>
                      <span className="text-[11px] text-ink-3">{s.name} · {s.source}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </Section>
      </div>

      <LeadPanel leadId={open} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}
