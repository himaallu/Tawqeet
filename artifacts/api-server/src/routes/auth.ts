import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, agencies, users, magicLinks, sessions, authRateLimits } from "@workspace/db";
import { RequestMagicLinkBody, GetSessionResponse } from "@workspace/api-zod";
import { hashToken, randomToken, COOKIE_NAME } from "../lib/security";
import { appOrigin, loginConfigured } from "../lib/config";
import { sendMagicLink } from "../lib/resend";

const router: IRouter = Router();
const genericMessage = { message: "If this email is authorized, a sign-in link is on its way. Check your inbox and spam folder." };
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many sign-in requests. Please try again in 15 minutes." } });

router.get("/auth/session", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(GetSessionResponse.parse({ user: req.user ?? null, loginConfigured: loginConfigured() }));
});

router.post("/auth/magic-link", authLimiter, async (req, res): Promise<void> => {
  const parsed = RequestMagicLinkBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  if (!loginConfigured()) {
    res.status(503).json({ error: "Sign-in is not configured. Set OWNER_EMAIL, RESEND_FROM_EMAIL, APP_URL and SESSION_SECRET on the server." }); return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  // Database-backed per-email limiter persists across process restarts.
  const key = hashToken(`login-rate:${email}`);
  const [rate] = await db.insert(authRateLimits).values({ key, attempts: 1, resetsAt: new Date(Date.now() + 15 * 60 * 1000) })
    .onConflictDoUpdate({ target: authRateLimits.key, set: {
      attempts: sql`case when ${authRateLimits.resetsAt} < now() then 1 else ${authRateLimits.attempts} + 1 end`,
      resetsAt: sql`case when ${authRateLimits.resetsAt} < now() then now() + interval '15 minutes' else ${authRateLimits.resetsAt} end`,
    } }).returning();
  if (rate!.attempts > 5) { res.status(429).json({ error: "Too many requests for this email. Try again in 15 minutes." }); return; }
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const isConfiguredOwner = email === process.env.OWNER_EMAIL!.trim().toLowerCase();
  if (!existing && !isConfiguredOwner) { res.json(genericMessage); return; }
  const [agency] = await db.select().from(agencies).where(eq(agencies.workspaceSlot, 1)).limit(1);
  if (!agency) { res.status(503).json({ error: "Agency setup is incomplete. Run db:seed." }); return; }
  if (existing && existing.agencyId !== agency.id) { res.json(genericMessage); return; }
  const token = randomToken();
  const tokenHash = hashToken(token);
  await db.insert(magicLinks).values({ tokenHash, agencyId: agency.id, email, expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
  // URL fragment is not sent to the webserver, proxy logs or referrer.
  const url = `${appOrigin()}/auth/confirm#token=${token}`;
  try {
    await sendMagicLink(email, url);
  } catch {
    await db.delete(magicLinks).where(and(eq(magicLinks.tokenHash, tokenHash), eq(magicLinks.agencyId, agency.id)));
    req.log.warn("Magic-link delivery failed; no token or email logged");
    res.status(502).json({ error: "The sign-in email could not be delivered. Check the Resend connection and verified sender address." }); return;
  }
  res.json(genericMessage);
});

router.post("/auth/verify", authLimiter, async (req, res): Promise<void> => {
  const token: unknown = req.body?.token;
  if (!loginConfigured()) { res.status(503).json({ error: "Sign-in is not configured." }); return; }
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    res.status(400).json({ error: "Invalid sign-in link. Request a new link." }); return;
  }
  const sessionToken = randomToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const user = await db.transaction(async tx => {
    // Serialize first-owner provisioning; a consumed token cannot be replayed.
    await tx.execute(sql`select pg_advisory_xact_lock(842731)`);
    const [agency] = await tx.select().from(agencies).where(eq(agencies.workspaceSlot, 1)).limit(1);
    if (!agency) return null;
    const [link] = await tx.delete(magicLinks).where(and(
      eq(magicLinks.tokenHash, hashToken(token)), eq(magicLinks.agencyId, agency.id), gt(magicLinks.expiresAt, new Date()),
    )).returning();
    if (!link) return null;
    let [found] = await tx.select().from(users).where(and(eq(users.email, link.email), eq(users.agencyId, agency.id))).limit(1);
    if (!found) {
      if (link.email !== process.env.OWNER_EMAIL!.trim().toLowerCase()) return null;
      const [owner] = await tx.select().from(users).where(and(eq(users.agencyId, agency.id), eq(users.role, "owner"))).limit(1);
      if (owner) return null; // changing OWNER_EMAIL cannot create a second owner
      [found] = await tx.insert(users).values({ agencyId: agency.id, email: link.email, role: "owner" }).returning();
    }
    if (!found) return null;
    await tx.insert(sessions).values({ tokenHash: hashToken(sessionToken), userId: found.id, agencyId: found.agencyId, expiresAt });
    return found;
  });
  if (!user) { res.status(400).json({ error: "This sign-in link has expired or was already used. Request a new link." }); return; }
  res.cookie(COOKIE_NAME, sessionToken, { httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax", path: "/", expires: expiresAt });
  res.set("Cache-Control", "no-store");
  res.json({ message: "Signed in." });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token === "string" && req.user) await db.delete(sessions).where(and(eq(sessions.tokenHash, hashToken(token)), eq(sessions.agencyId, req.user.agencyId)));
  res.clearCookie(COOKIE_NAME, { path: "/", httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax" });
  res.json({ message: "Signed out." });
});
export default router;
