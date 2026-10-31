import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
// Local development only. Replit preview uses artifact-owned workflows.
const port = Number(process.env.PORT || "3000");
const vitePort = Number(process.env.WEB_PORT || "3001");
const apiPort = Number(process.env.API_PORT || "5000");
const api = spawn("pnpm", ["--filter", "@workspace/api-server", "run", "dev"], { stdio: "inherit", env: { ...process.env, PORT: process.env.API_PORT || "5000" } });
const web = spawn("pnpm", ["--filter", "@workspace/tawqeet", "run", "dev"], { stdio: "inherit", env: { ...process.env, PORT: String(vitePort), BASE_PATH: "/" } });
// Same-origin local gateway; Replit already provides its own shared path proxy.
const gateway = http.createServer((req, res) => {
  const target = http.request({ hostname: "127.0.0.1", port: req.url?.startsWith("/api") ? apiPort : vitePort,
    method: req.method, path: req.url, headers: req.headers }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers); upstream.pipe(res);
  });
  target.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("Development services are starting. Refresh shortly."); });
  req.pipe(target);
});
gateway.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(vitePort, "127.0.0.1", () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${req.rawHeaders.reduce((out, v, i) => out + v + (i % 2 ? "\r\n" : ": "), "")}\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});
gateway.listen(port, "127.0.0.1", () => process.stdout.write(`Tawqeet local development: http://localhost:${port}\n`));
const stop = () => { api.kill("SIGTERM"); web.kill("SIGTERM"); gateway.close(); };
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
for (const child of [api, web]) child.once("exit", code => { stop(); process.exitCode = code ?? 1; });
