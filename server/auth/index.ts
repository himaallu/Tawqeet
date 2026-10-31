import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import type { Role } from "../../shared/enums";
import { db } from "../db";
import { authTokens, sessions, users } from "../db/schema";
import { escapeHtml, layoutHtml, sendMail } from "../lib/mail";

/**
 * Email magic-link auth. No passwords anywhere. Tokens and session ids are stored as SHA-256
 * hashes, so a database leak does not leak live credentials.
 */
export const SESSION_COOKIE = "tq_session";
const LINK_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 30 * 86_400_000;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  agencyId: string | null;
  clientId: string | null;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
    /** Set by requireAgency(). The only agency id routes may use in queries. */
    agencyId: string;
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function appUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) return `${req.protocol}://${req.get("host")}`;
  return "http://localhost:5000";
}

export async function requestMagicLink(email: string, baseUrl: string, next = "/app") {
  const token = randomBytes(32).toString("base64url");
  await db.insert(authTokens).values({
    email,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  });
  const url = `${baseUrl}/api/auth/verify?token=${token}&next=${encodeURIComponent(next)}`;
  await sendMail({
    to: email,
    subject: "Your Tawqeet sign-in link",
    text: `Sign in to Tawqeet:\n${url}\n\nThis link expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    html: layoutHtml(
      "Sign in to Tawqeet",
      `<p>Click to sign in. The link expires in 15 minutes.</p>
       <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1814;color:#fff;padding:10px 18px;border-radius:9px;text-decoration:none">Sign in</a></p>
       <p style="color:#8a847a;font-size:13px">If you didn't ask for this, ignore this email.</p>`,
    ),
  });
}

/** Consumes a magic-link token and returns a new session cookie value, or null. */
export async function consumeMagicLink(token: string): Promise<string | null> {
  const now = new Date();
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.tokenHash, sha256(token)), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now)))
    .returning();
  if (!row) return null;

  const email = row.email.toLowerCase();
  const [user] = await db
    .insert(users)
    .values({ email, lastLoginAt: now })
    .onConflictDoUpdate({ target: users.email, set: { lastLoginAt: now } })
    .returning();

  const cookie = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ id: sha256(cookie), userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  return cookie;
}

export function setSessionCookie(res: Response, value: string) {
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export async function destroySession(req: Request, res: Response) {
  const value = req.cookies?.[SESSION_COOKIE];
  if (value) await db.delete(sessions).where(eq(sessions.id, sha256(value)));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Loads req.user from the session cookie (if any). */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const value = req.cookies?.[SESSION_COOKIE];
    if (value) {
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          agencyId: users.agencyId,
          clientId: users.clientId,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, sha256(value)), gt(sessions.expiresAt, new Date())));
      if (row) req.user = row;
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  next();
}

/** Any member of an agency, including client viewers. Sets req.agencyId. */
export function requireAgency(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  if (!req.user.agencyId) return res.status(403).json({ error: "Create an agency first", code: "no_agency" });
  req.agencyId = req.user.agencyId;
  next();
}

/** Agency staff (owner/member). Client viewers are read-only and limited to their client. */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  requireAgency(req, res, () => {
    if (req.user!.role === "client_viewer") return res.status(403).json({ error: "Agency staff only" });
    next();
  });
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  requireAgency(req, res, () => {
    if (req.user!.role !== "owner") return res.status(403).json({ error: "Agency owner only" });
    next();
  });
}
