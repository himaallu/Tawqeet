import cookieParser from "cookie-parser";
import express from "express";
import { loadSession } from "./auth";
import { errorHandler } from "./http";
import { businessRoutes } from "./routes/business";
import { clientRoutes } from "./routes/clients";
import { coreRoutes, stripeWebhook } from "./routes/core";
import { pipelineRoutes } from "./routes/pipeline";

/** The API, without static serving — tests drive this directly. */
export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // Replit serves behind a proxy
  app.disable("x-powered-by");
  stripeWebhook(app); // raw body, before the JSON parser
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(loadSession);

  const api = express.Router();
  coreRoutes(api);
  clientRoutes(api);
  pipelineRoutes(api);
  businessRoutes(api);
  api.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use("/api", api);
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}
