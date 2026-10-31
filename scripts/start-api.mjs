import { spawn } from "node:child_process";
// Used by the API artifact in production. Two separate Node processes on one VM.
const children = ["index", "worker"].map(name => spawn(process.execPath, [
  "--enable-source-maps", `artifacts/api-server/dist/${name}.mjs`,
], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } }));
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => { for (const child of children) child.kill("SIGKILL"); }, 20_000).unref();
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
for (const child of children) child.once("exit", (code, signal) => {
  stop();
  process.exitCode = signal && !["SIGTERM", "SIGINT"].includes(signal) ? 1 : code ?? 1;
});
