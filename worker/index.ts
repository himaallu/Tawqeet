import "../server/lib/load-env";
import { PgBoss } from "pg-boss";
import { runJob, SCHEDULES } from "../server/job-handlers";
import { Q, type QueueName } from "../server/lib/jobs";

/**
 * Background worker — a separate process from the web app, sharing the same Postgres via pg-boss.
 * Registers the recurring schedules (idempotent) and works every queue.
 */
const CONCURRENCY: Partial<Record<QueueName, number>> = {
  [Q.processSignal]: 4,
  [Q.generateDrafts]: 3,
  [Q.simulate]: 3,
  [Q.alert]: 4,
  [Q.sendEmail]: 2,
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const boss = new PgBoss(process.env.DATABASE_URL);
  boss.on("error", (err) => console.error("[worker] pg-boss error", err));
  await boss.start();

  for (const name of Object.values(Q)) await boss.createQueue(name);
  for (const s of SCHEDULES) await boss.schedule(s.name, s.cron, s.data ?? {}, { tz: s.tz, key: s.key });

  for (const name of Object.values(Q)) {
    await boss.work<Record<string, string>>(name, { localConcurrency: CONCURRENCY[name] ?? 1 }, async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          const out = await runJob(name, job.data ?? {});
          console.log(`[worker] ${name} ${job.id} ok ${Date.now() - started}ms ${out ? JSON.stringify(out).slice(0, 160) : ""}`);
        } catch (e) {
          console.error(`[worker] ${name} ${job.id} failed: ${(e as Error).message}`);
          throw e; // let pg-boss retry
        }
      }
    });
  }
  console.log(`[worker] started: ${Object.values(Q).length} queues, ${SCHEDULES.length} schedules (Gulf time)`);

  const shutdown = async () => {
    console.log("[worker] stopping");
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] failed to start", err);
  process.exit(1);
});
