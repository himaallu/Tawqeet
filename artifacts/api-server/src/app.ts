import express, { type Express, type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadSession, sameOrigin } from "./lib/security";
import { BrainError } from "./lib/brain/errors";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:"], connectSrc: ["'self'", "https://storage.googleapis.com"],
    frameAncestors: ["'self'", "https://replit.com", "https://*.replit.dev"],
  },
}, frameguard: false }));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use("/api/clients/:id/brain/crm/csv", express.json({ limit: "1200kb" }));
app.use(express.json({ limit: "128kb" }));
app.use(cookieParser());
app.use("/api", sameOrigin, loadSession, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api", router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "API endpoint not found." }); });
const handleError: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof BrainError) { res.status(err.status).json({ error: err.message }); return; }
  // Never log error bodies: authentication errors can include tokens or credentials.
  req.log.error({ errorName: err instanceof Error ? err.name : "UnknownError" }, "Request failed");
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? "The server could not complete this request." : "Invalid request." });
};
app.use(handleError);

if (process.env.SERVE_WEB === "true") {
  const publicDir = path.resolve(import.meta.dirname, "../../tawqeet/dist/public");
  app.use(express.static(publicDir));
  app.get("/{*splat}", (_req, res) => { res.sendFile(path.join(publicDir, "index.html")); });
}

export default app;
