import { Q, type QueueName } from "./lib/jobs";
import { alertLead, coldSummary, flushBundle, releaseHeld, warmDigest } from "./services/alerts";
import { crawlWebsite } from "./services/brain";
import { checkMailboxHealth } from "./services/health";
import { enrichContacts, processSignal } from "./services/pipeline";
import { runCareersJob, runFeedJob, runPeopleJob } from "./services/radar";
import { sendWeeklyReports } from "./services/reports";
import { decayAll } from "./services/scoring";
import { performSend } from "./services/sending";
import { simulateLead } from "./services/simulate";
import { generateDrafts } from "./services/writer";

/** One dispatcher used by the worker (pg-boss) and by tests (inline). */
type Data = Record<string, string | undefined>;

export async function runJob(name: QueueName, data: Data): Promise<unknown> {
  switch (name) {
    case Q.radarNews:
      return runFeedJob("radar-news");
    case Q.radarTenders:
      return runFeedJob("radar-tenders");
    case Q.radarCareers:
      return runCareersJob();
    case Q.radarPeople:
      return runPeopleJob();
    case Q.thermoDecay:
      return decayAll();
    case Q.processSignal:
      return processSignal(data.signalId!);
    case Q.enrichContacts:
      return enrichContacts(data.agencyId!, data.accountId!);
    case Q.generateDrafts:
      return generateDrafts(data.agencyId!, data.leadId!);
    case Q.simulate:
      return simulateLead(data.agencyId!, data.leadId!);
    case Q.alert:
      if (data.bundleClientId) return flushBundle(data.agencyId!, data.bundleClientId);
      if (data.heldRuleId) return releaseHeld(data.agencyId!, data.heldRuleId, data.leadId!);
      return alertLead(data.agencyId!, data.leadId!);
    case Q.digestWarm:
      return warmDigest(data.tz ?? "Asia/Dubai");
    case Q.summaryCold:
      return coldSummary(data.tz ?? "Asia/Dubai");
    case Q.sendEmail:
      return performSend(data.agencyId!, data.sendId!);
    case Q.mailboxHealth:
      return checkMailboxHealth();
    case Q.weeklyReport:
      return sendWeeklyReports(data.tz ?? "Asia/Dubai");
    case Q.crawlWebsite:
      return crawlWebsite(data.agencyId!, data.clientId!, data.url!);
  }
}

/** Recurring jobs. All times are Gulf time; digests run once per Gulf offset (UTC+4, UTC+3). */
export const SCHEDULES: { name: QueueName; cron: string; key: string; tz: string; data?: Data }[] = [
  { name: Q.radarNews, cron: "*/30 7-21 * * *", key: "day", tz: "Asia/Dubai" },
  { name: Q.radarNews, cron: "0 22,23,0-6 * * *", key: "night", tz: "Asia/Dubai" },
  { name: Q.radarCareers, cron: "0 2 * * *", key: "daily", tz: "Asia/Dubai" },
  { name: Q.radarTenders, cron: "0 6 * * *", key: "daily", tz: "Asia/Dubai" },
  { name: Q.radarPeople, cron: "0 1 * * 0", key: "weekly", tz: "Asia/Dubai" },
  { name: Q.thermoDecay, cron: "30 1 * * *", key: "nightly", tz: "Asia/Dubai" },
  { name: Q.digestWarm, cron: "30 8 * * *", key: "gst", tz: "Asia/Dubai", data: { tz: "Asia/Dubai" } },
  { name: Q.digestWarm, cron: "30 8 * * *", key: "ast", tz: "Asia/Riyadh", data: { tz: "Asia/Riyadh" } },
  { name: Q.summaryCold, cron: "35 8 * * *", key: "gst", tz: "Asia/Dubai", data: { tz: "Asia/Dubai" } },
  { name: Q.summaryCold, cron: "35 8 * * *", key: "ast", tz: "Asia/Riyadh", data: { tz: "Asia/Riyadh" } },
  { name: Q.weeklyReport, cron: "0 9 * * *", key: "gst", tz: "Asia/Dubai", data: { tz: "Asia/Dubai" } },
  { name: Q.weeklyReport, cron: "0 9 * * *", key: "ast", tz: "Asia/Riyadh", data: { tz: "Asia/Riyadh" } },
  { name: Q.mailboxHealth, cron: "0 23 * * *", key: "daily", tz: "Asia/Dubai" },
];
