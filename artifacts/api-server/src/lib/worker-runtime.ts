import { PgBoss } from "pg-boss";
import { and, eq, lt } from "drizzle-orm";
import { db, pool, sessions, magicLinks, authRateLimits, workerHeartbeat } from "@workspace/db";
import { logger } from "./logger";
import { collectNews, watchPages, collectOcean, checkChampions } from "./signals/collectors";
import { leadEvidence } from "./signals/scoring";
import { sendDigestAllAgencies } from "./digests";
import { sql } from "drizzle-orm";

export async function runWorker(): Promise<void> {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
  boss.on("error", () => logger.error("pg-boss worker error; check database connectivity"));
  await boss.start(); // pg-boss owns and creates its own queue schema.
  await boss.createQueue("auth-cleanup");
  await boss.work("auth-cleanup", async () => {
    const now = new Date();
    await db.delete(sessions).where(lt(sessions.expiresAt, now));
    await db.delete(magicLinks).where(lt(magicLinks.expiresAt, now));
    await db.delete(authRateLimits).where(lt(authRateLimits.resetsAt, now));
  });
  await boss.schedule("auth-cleanup", "17 * * * *", {}, { tz: "Asia/Dubai" });
  const jobs = [
    ["signals-news", "11 * * * *", collectNews],
    ["signals-pages", "29 3 * * *", watchPages],
    ["signals-leadocean", "13 4 * * 1", collectOcean],
    ["signals-champions", "43 4 * * 1", checkChampions],
    ["signals-decay", "7 * * * *", async () => db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(842733)`);
      await leadEvidence(undefined, tx, true);
    })],
    // UAE workweek is Monday–Friday; Monday is the first workday.
    ["alerts-warm-digest", "30 8 * * 1-5", () => sendDigestAllAgencies("warm")],
    ["alerts-cold-weekly", "30 8 * * 1", () => sendDigestAllAgencies("cold")],
  ] as const;
  for (const [name, cron, handler] of jobs) {
    await boss.createQueue(name, { retryLimit: 2, retryDelay: 300 });
    await boss.work(name, { localConcurrency: 1 }, async () => { await handler(); });
    await boss.schedule(name, cron, {}, { tz: "Asia/Dubai" });
  }
  const beat = () => db.insert(workerHeartbeat).values({ id: "main", seenAt: new Date() })
    .onConflictDoUpdate({ target: workerHeartbeat.id, set: { seenAt: new Date() } });
  await beat();
  const timer = setInterval(() => { void beat().catch(() => logger.error("Worker heartbeat failed")); }, 30_000);
  logger.info("Tawqeet worker ready: authentication maintenance, signal collectors, hourly decay and alert digests.");
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    await boss.stop({ graceful: true, timeout: 15_000 });
    await db.delete(workerHeartbeat).where(and(eq(workerHeartbeat.id, "main")));
    await pool.end();
  };
  process.once("SIGTERM", () => { void stop().then(() => process.exit(0)); });
  process.once("SIGINT", () => { void stop().then(() => process.exit(0)); });
}
