import { spawn } from "node:child_process";
// Express serves built web assets and API; worker is a separate OS process.
const web = spawn("pnpm", ["--filter", "@workspace/api-server", "run", "start"], {
  stdio: "inherit", env: { ...process.env, NODE_ENV: "production", SERVE_WEB: "true" },
});
const worker = spawn("pnpm", ["--filter", "@workspace/api-server", "run", "worker:prod"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  web.kill("SIGTERM"); worker.kill("SIGTERM");
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
for (const child of [web, worker]) child.once("exit", code => { stop(); process.exitCode = code ?? 1; });
