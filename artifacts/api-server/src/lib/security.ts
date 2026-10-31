import { createHmac, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import type { RequestHandler } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessions, users } from "@workspace/db";
import { appOrigin } from "./config";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; agencyId: string; email: string; role: "owner" | "member" | "client_viewer" };
    }
  }
}
export const COOKIE_NAME = "tawqeet_session";
export const randomToken = () => randomBytes(32).toString("base64url");
export function hashToken(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export const sameOrigin: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  try {
    const origin = req.get("origin");
    if (!origin || origin !== appOrigin()) {
      res.status(403).json({ error: "Request origin is not allowed." }); return;
    }
  } catch {
    res.status(503).json({ error: "The app URL is not configured." }); return;
  }
  const hasBody = Number(req.get("content-length") || 0) > 0 || Boolean(req.get("transfer-encoding"));
  if (hasBody && !req.is("application/json")) {
    res.status(415).json({ error: "Use application/json." }); return;
  }
  next();
};
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) && process.env.SESSION_SECRET) {
    const [row] = await db.select({ id: users.id, agencyId: users.agencyId, email: users.email, role: users.role })
      .from(sessions).innerJoin(users, and(eq(users.id, sessions.userId), eq(users.agencyId, sessions.agencyId)))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
    req.user = row?.email === "demo@tawqeet.invalid" && process.env.DEMO_MODE !== "true" ? undefined : row;
  }
  next();
};
export const requireUser: RequestHandler = (req, res, next) => {
  if (!req.user) { res.status(401).json({ error: "Sign in to continue." }); return; }
  next();
};
export const requireOwner: RequestHandler = (req, res, next) => {
  if (req.user?.role !== "owner") { res.status(403).json({ error: "Only the agency owner can do this." }); return; }
  next();
};
export const requireAgencyStaff: RequestHandler = (req, res, next) => {
  if (!req.user || req.user.role === "client_viewer") {
    res.status(403).json({ error: "Client access is not enabled in this phase." }); return;
  }
  next();
};

// No OAuth token persistence is exposed this phase; future providers must use these.
function encryptionKey(): Buffer {
  const value = process.env.ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("ENCRYPTION_KEY must be 64 hexadecimal characters.");
  return Buffer.from(value, "hex");
}
export function encryptTokens(plaintext: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}
export function decryptTokens(encrypted: string): string {
  const [version, nonce, tag, body] = encrypted.split(".");
  if (version !== "v1" || !nonce || !tag || !body) throw new Error("Invalid encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
