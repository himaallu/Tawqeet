import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { createApp } from "../server/app";
import { db } from "../server/db";
import { signalDefinitions } from "../server/db/schema";
import { runJob } from "../server/job-handlers";
import { runJobsInline, type QueueName } from "../server/lib/jobs";
import { devOutbox } from "../server/lib/mail";
import { DEFAULT_SIGNAL_DEFINITIONS } from "../server/services/play-library";

/** Jobs are collected instead of going to pg-boss; drain() runs them (send-email excluded). */
export const queued: { name: QueueName; data: Record<string, string> }[] = [];
runJobsInline(async (name, data) => {
  queued.push({ name, data: data as Record<string, string> });
});

export async function drain(opts: { skip?: QueueName[] } = {}) {
  const skip = new Set<QueueName>(opts.skip ?? ["send-email"]);
  for (let guard = 0; guard < 500; guard++) {
    const i = queued.findIndex((j) => !skip.has(j.name));
    if (i < 0) return;
    const [job] = queued.splice(i, 1);
    await runJob(job.name, job.data);
  }
  throw new Error("drain(): too many jobs");
}

export async function resetDb() {
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`);
  await db.execute(sql.raw(`truncate ${tables.rows.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`));
  await db.insert(signalDefinitions).values([...DEFAULT_SIGNAL_DEFINITIONS]);
  queued.length = 0;
  devOutbox.length = 0;
}

export async function startApp() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

/** A tiny cookie-carrying client for one user. */
export function agent(base: string) {
  let cookie = "";
  async function call(method: string, path: string, body?: unknown) {
    const res = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json as any, headers: res.headers };
  }
  return {
    get: (p: string) => call("GET", p),
    post: (p: string, b?: unknown) => call("POST", p, b ?? {}),
    patch: (p: string, b?: unknown) => call("PATCH", p, b ?? {}),
    del: (p: string, b?: unknown) => call("DELETE", p, b),
    /** Full magic-link sign-in through the real endpoints. */
    async signIn(email: string) {
      const r = await call("POST", "/api/auth/request", { email });
      if (r.status !== 200) throw new Error(`request link failed: ${JSON.stringify(r.body)}`);
      const mail = [...devOutbox].reverse().find((m) => [m.to].flat().includes(email));
      const url = mail?.text.match(/https?:\/\/\S+\/api\/auth\/verify\?\S+/)?.[0];
      if (!url) throw new Error("no magic link in outbox");
      const u = new URL(url);
      const v = await call("GET", u.pathname + u.search);
      if (v.status !== 302 || !cookie) throw new Error(`verify failed: ${v.status}`);
    },
  };
}
