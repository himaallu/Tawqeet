import "./lib/load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./app";

/**
 * Web process: Express serves the API and the React app. In development Vite runs as
 * middleware (hot reload); in production the built files in dist/public are served.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 5000);
const app = createApp();

if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist/public");
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ configFile: path.join(root, "vite.config.ts"), server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.listen(port, "0.0.0.0", () => console.log(`[web] http://localhost:${port}`));
