import { PgBoss } from "pg-boss";
import { and, eq, lt } from "drizzle-orm";
import { db, pool, sessions, magicLinks, authRateLimits, workerHeartbeat } from "@workspace/db";
import { logger } from "./logger";

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
  // Deliberately no radar/decay schedules or send workers until their phases.
  const beat = () => db.insert(workerHeartbeat).values({ id: "main", seenAt: new Date() })
    .onConflictDoUpdate({ target: workerHeartbeat.id, set: { seenAt: new Date() } });
  await beat();
  const timer = setInterval(() => { void beat().catch(() => logger.error("Worker heartbeat failed")); }, 30_000);
  logger.info("Tawqeet worker ready. Only authentication maintenance is enabled.");
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
