// pnpm run check:env — lists missing required vars, then live-tests each configured service. Prints names and PASS/FAIL/SKIP only.
import { loadEnv } from "./load-env";
loadEnv();
const color = { PASS: "\x1b[32m", FAIL: "\x1b[31m", SKIP: "\x1b[90m" } as const;
const line = (s: keyof typeof color, label: string, detail: string) => console.log(`${color[s]}${s.padEnd(4)}\x1b[0m  ${label.padEnd(28)} ${detail}`);
const required = ["DATABASE_URL", "SESSION_SECRET", "OWNER_EMAIL", "RESEND_FROM_EMAIL"].filter(k => !process.env[k]);
if (!process.env.APP_URL && !process.env.REPLIT_DEV_DOMAIN) required.push("APP_URL");
console.log("Tawqeet environment check\n");
console.log(required.length ? `Missing required: ${required.join(", ")}\n` : "All required variables are set.\n");
let failed = required.length > 0;
if (!process.env.DATABASE_URL) {
  line("FAIL", "Database", "DATABASE_URL is not set; other live checks need it.");
  process.exit(1);
}
const { runServiceChecks } = await import("../artifacts/api-server/src/lib/service-checks");
const { pool } = await import("../lib/db/src/index");
try {
  for (const c of await runServiceChecks({ active: true })) {
    line(c.status.toUpperCase() as keyof typeof color, c.label, c.detail);
    if (c.status === "fail") failed = true;
  }
} finally { await pool.end(); }
console.log(failed ? "\nSome checks failed." : "\nAll configured services passed.");
process.exit(failed ? 1 : 0);
