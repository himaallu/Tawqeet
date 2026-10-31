import { PgBoss } from "pg-boss";

/**
 * pg-boss queue names and a lazily started client for enqueueing from the web process.
 * The worker (worker/index.ts) owns schedules and handlers.
 */
export const Q = {
  radarNews: "radar-news",
  radarCareers: "radar-careers",
  radarTenders: "radar-tenders",
  radarPeople: "radar-people",
  thermoDecay: "thermo-decay",
  processSignal: "process-signal",
  enrichContacts: "enrich-contacts",
  generateDrafts: "generate-drafts",
  simulate: "simulate",
  alert: "alert",
  digestWarm: "digest-warm",
  summaryCold: "summary-cold",
  sendEmail: "send-email",
  mailboxHealth: "mailbox-health",
  weeklyReport: "weekly-report",
  crawlWebsite: "crawl-website",
} as const;
export type QueueName = (typeof Q)[keyof typeof Q];

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  if (!starting) {
    starting = (async () => {
      const b = new PgBoss({ connectionString: process.env.DATABASE_URL, supervise: false, schedule: false });
      b.on("error", (err) => console.error("[jobs] pg-boss error", err));
      await b.start();
      for (const name of Object.values(Q)) await b.createQueue(name);
      boss = b;
      return b;
    })();
  }
  return starting;
}

/** Test hook: when set, enqueue() calls this instead of pg-boss. */
let inlineRunner: ((name: QueueName, data: object) => Promise<void>) | null = null;
export function runJobsInline(fn: typeof inlineRunner) {
  inlineRunner = fn;
}

export async function enqueue(name: QueueName, data: object, options: { startAfter?: Date; singletonKey?: string } = {}) {
  if (inlineRunner) return inlineRunner(name, data);
  const b = await getBoss();
  return b.send(name, data, options);
}
