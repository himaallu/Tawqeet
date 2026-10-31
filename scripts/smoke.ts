// pnpm run smoke — end-to-end demo path against a running app with DEMO_MODE=true.
// SMOKE_URL defaults to APP_URL (or http://localhost:$PORT). Missing external services are SKIP, not FAIL.
import { loadEnv } from "./load-env";
loadEnv();
const base = (process.env.SMOKE_URL || process.env.APP_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/, "");
const origin = new URL(process.env.APP_URL || base).origin;
let cookie = "";
type Result = "PASS" | "FAIL" | "SKIP";
const results: [Result, string, string][] = [];
const log = (r: Result, step: string, detail = "") => { results.push([r, step, detail]); console.log(`${r === "PASS" ? "\x1b[32m" : r === "FAIL" ? "\x1b[31m" : "\x1b[90m"}${r.padEnd(4)}\x1b[0m  ${step.padEnd(34)} ${detail}`); };
async function api(path: string, init: { method?: string; body?: unknown; jar?: "main" | "viewer" } = {}) {
  const jar = init.jar === "viewer" ? viewerCookie : cookie;
  const r = await fetch(`${base}/api${path}`, { method: init.method || "GET", signal: AbortSignal.timeout(60000),
    headers: { origin, "content-type": "application/json", ...(jar ? { cookie: jar } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const set = r.headers.get("set-cookie");
  if (set) { const c = set.split(";")[0]!; if (init.jar === "viewer") viewerCookie = c; else cookie = c; }
  const data = await r.json().catch(() => ({})) as any;
  return { status: r.status, data };
}
let viewerCookie = "";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitJob(maxMs: number) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) { const s = (await api("/demo/status")).data; if (!s.running) return s; await sleep(3000); }
  return null;
}
const has = (...k: string[]) => k.every(x => process.env[x]);

console.log(`Tawqeet smoke test against ${base}\n`);
try {
  const status = await api("/demo/status");
  if (!status.data.enabled) { log("FAIL", "Demo mode", "DEMO_MODE is not true on the server."); throw new Error("stop"); }
  const login = await api("/demo/login", { method: "POST" });
  log(login.status === 200 ? "PASS" : "FAIL", "Demo login", `HTTP ${login.status}`);

  const load = await api("/demo/load", { method: "POST", body: {} });
  if (load.status === 202 || load.status === 409) {
    const done = await waitJob(15 * 60_000);
    log(done && !done.error ? "PASS" : "FAIL", "Load demo data", done ? done.error || done.stage : "timed out after 15 min");
  } else log("FAIL", "Load demo data", `HTTP ${load.status}`);

  const radar = (await api("/demo/radar")).data;
  for (const name of ["Autobia", "Foodics"]) {
    const hot = (radar.leads || []).filter((l: any) => l.companyName === name && l.temperature === "hot");
    log(hot.length ? "PASS" : "FAIL", `${name} Hot`, hot.length ? `${hot.length} Hot leads, score ${hot[0].totalScore}` : "not Hot");
  }
  const hotLeads = (radar.leads || []).filter((l: any) => l.temperature === "hot");
  const ai = has("AI_MODEL") && (has("ANTHROPIC_API_KEY") || has("GEMINI_API_KEY") || has("OPENAI_API_KEY"));
  const complete = hotLeads.filter((l: any) => l.drafts.length === 3 && l.drafts.every((d: any) => d.score !== null && d.simulation));
  log(complete.length === hotLeads.length && hotLeads.length ? "PASS" : ai ? "FAIL" : "SKIP", "3 drafts + simulation per Hot lead",
    `${complete.length}/${hotLeads.length} complete${ai ? "" : " (no AI key locally)"}`);

  const target = complete[0]?.drafts[0];
  if (target) {
    const rw = await api(`/demo/drafts/${target.id}/rewrite`, { method: "POST" });
    const done = rw.status === 202 ? await waitJob(5 * 60_000) : null;
    const noAi = !ai || /AI_MODEL|No API key/i.test(done?.error || "");
    log(done && !done.error ? "PASS" : rw.status === 402 || noAi ? "SKIP" : "FAIL", "Rewrite one draft", done ? done.error || "re-scored" : `HTTP ${rw.status}`);
  } else log("SKIP", "Rewrite one draft", "no drafts");

  const queue = (await api("/review/queue")).data;
  const ready = (queue.items || []).find((i: any) => i.state === "ready");
  if (!ready) log("SKIP", "Approve & Send (demo recipient)", "no ready email (all sent or blocked)");
  else {
    const d = ready.drafts.find((x: any) => x.id === ready.winnerDraftId);
    const send = await api(`/review/drafts/${d.id}/send`, { method: "POST", body: { subject: d.subject, body: d.body } });
    const email = has("RESEND_FROM_EMAIL") && (has("ALERT_EMAIL_TO") || has("OWNER_EMAIL"));
    log(send.status === 200 ? "PASS" : !email ? "SKIP" : "FAIL", "Approve & Send (demo recipient)", send.data.message || send.data.error || `HTTP ${send.status}`);
  }

  const alert = await api("/settings/alerts/test", { method: "POST", body: { channel: "webhook" } });
  log(/sent/i.test(alert.data.message || "") && !/not sent|failed/i.test(alert.data.message) ? "PASS" : has("ALERT_WEBHOOK_URL") ? "FAIL" : "SKIP", "Test alert (webhook)", alert.data.message || alert.data.error || "");
  const digest = await api("/settings/alerts/digest", { method: "POST", body: { kind: "warm" } });
  const dm = digest.data.message || digest.data.error || "";
  log(/sent to|No new Warm/i.test(dm) ? "PASS" : has("RESEND_FROM_EMAIL") ? "FAIL" : "SKIP", "Digest now (warm)", dm);

  const clientId = (await api("/reports")).data.clients?.[0]?.id;
  const share = clientId ? await api("/reports/share", { method: "POST", body: { clientId } }) : { status: 0, data: {} as any };
  if (share.status === 200) {
    const token = String(share.data.url).split("/share/")[1];
    await api("/share/login", { method: "POST", body: { token }, jar: "viewer" });
    const rep = await api("/reports", { jar: "viewer" }), blocked = await api("/review/queue", { jar: "viewer" });
    log(rep.data.readOnly === true && blocked.status === 403 ? "PASS" : "FAIL", "Share link opens read-only", `report ${rep.status}, staff API ${blocked.status}`);
  } else log("FAIL", "Share link opens read-only", `HTTP ${share.status}`);

  const check = await api("/settings/compliance/check", { method: "POST", body: { email: "someone@gmail.com" } });
  log(check.data.allowed === false ? "PASS" : "FAIL", "gmail.com address blocked", (check.data.reasons || []).join("; "));
} catch (e) { if (!(e instanceof Error && e.message === "stop")) log("FAIL", "Smoke run", e instanceof Error ? e.message : "error"); }
const fails = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.filter(r => r[0] === "PASS").length} pass, ${fails} fail, ${results.filter(r => r[0] === "SKIP").length} skip`);
process.exit(fails ? 1 : 0);
