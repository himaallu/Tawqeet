import { existsSync } from "node:fs";
/** Loads the repo-root .env (if present) without overriding real environment variables. Never prints values. */
export function loadEnv() {
  const path = new URL("../.env", import.meta.url);
  if (existsSync(path)) { try { process.loadEnvFile(path); } catch { /* malformed .env: rely on process.env */ } }
}
