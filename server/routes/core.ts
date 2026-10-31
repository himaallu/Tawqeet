import { and, desc, eq, gte, sql } from "drizzle-orm";
import express, { type Router } from "express";
import { z } from "zod";
import { ROLES } from "../../shared/enums";
import { appUrl, consumeMagicLink, destroySession, requestMagicLink, requireOwner, requireStaff, requireUser, setSessionCookie } from "../auth";
import { db } from "../db";
import { agencies, aiUsage, clients, plays, users, waitlist } from "../db/schema";
import { HttpError, h, param, parse } from "../http";
import { audit } from "../lib/audit";
import { offlineMode } from "../lib/ai";
import { runSystemCheck } from "../lib/system-check";
import { handleWebhook } from "../services/billing";
import { handleInbound, parseInbound, unsubscribeByToken } from "../services/sending";
import { defaultPlays } from "../services/play-library";
import { usageFor } from "../services/usage";

const emailSchema = z.email("Enter a valid email").transform((e) => e.trim().toLowerCase());

export const isPlatformAdmin = (email: string) =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase()) || (process.env.NODE_ENV !== "production" && email.endsWith("@tawqeet.demo"));

/** Agency creation: the user's one agency, seeded with the default play library. */
export async function createAgency(userId: string, name: string) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (u.agencyId) return u.agencyId;
    const [a] = await tx.insert(agencies).values({ name }).returning();
    await tx.update(users).set({ agencyId: a.id, role: "owner" }).where(eq(users.id, userId));
    await tx.insert(plays).values(defaultPlays(a.id));
    return a.id;
  });
}

export function coreRoutes(r: Router) {
  // ---------- auth ----------
  const lastRequest = new Map<string, number>();
  r.post(
    "/auth/request",
    h(async (req) => {
      const { email, next } = parse(z.object({ email: emailSchema, next: z.string().startsWith("/").optional() }), req.body);
      const last = lastRequest.get(email) ?? 0;
      if (process.env.NODE_ENV !== "test" && Date.now() - last < 20_000) throw new HttpError(429, "Check your inbox — a link is on its way. Try again in a few seconds.");
      lastRequest.set(email, Date.now());
      await requestMagicLink(email, appUrl(req), next ?? "/app");
      return { ok: true };
    }),
  );

  r.get(
    "/auth/verify",
    h(async (req, res) => {
      const token = String(req.query.token ?? "");
      const next = String(req.query.next ?? "/app");
      const cookie = token ? await consumeMagicLink(token) : null;
      if (!cookie) return res.redirect("/login?error=expired");
      setSessionCookie(res, cookie);
      res.redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/app");
    }),
  );

  r.post(
    "/auth/logout",
    h(async (req, res) => {
      await destroySession(req, res);
      return { ok: true };
    }),
  );

  r.get(
    "/me",
    requireUser,
    h(async (req) => {
      const u = req.user!;
      if (!u.agencyId) return { user: u, agency: null, usage: null, admin: isPlatformAdmin(u.email), offline: offlineMode() };
      const [agency] = await db.select().from(agencies).where(eq(agencies.id, u.agencyId));
      return { user: u, agency, usage: await usageFor(u.agencyId), admin: isPlatformAdmin(u.email), offline: offlineMode() };
    }),
  );

  r.post(
    "/onboarding",
    requireUser,
    h(async (req) => {
      const { name } = parse(z.object({ name: z.string().trim().min(2, "Agency name must be at least 2 characters").max(120) }), req.body);
      return { agencyId: await createAgency(req.user!.id, name) };
    }),
  );

  // ---------- agency + team ----------
  r.patch(
    "/agency",
    requireOwner,
    h(async (req) => {
      const { name } = parse(z.object({ name: z.string().trim().min(2).max(120) }), req.body);
      await db.update(agencies).set({ name }).where(eq(agencies.id, req.agencyId));
      return { ok: true };
    }),
  );

  r.get(
    "/team",
    requireStaff,
    h(async (req) =>
      db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role, clientId: users.clientId, clientName: clients.name, lastLoginAt: users.lastLoginAt })
        .from(users)
        .leftJoin(clients, eq(clients.id, users.clientId))
        .where(eq(users.agencyId, req.agencyId))
        .orderBy(users.createdAt),
    ),
  );

  r.post(
    "/team/invite",
    requireOwner,
    h(async (req) => {
      const body = parse(z.object({ email: emailSchema, role: z.enum(ROLES), clientId: z.uuid().optional() }), req.body);
      if (body.role === "client_viewer") {
        if (!body.clientId) throw new HttpError(400, "Pick the client this viewer can see");
        const [c] = await db.select().from(clients).where(and(eq(clients.agencyId, req.agencyId), eq(clients.id, body.clientId)));
        if (!c) throw new HttpError(404, "Client not found");
      }
      const [existing] = await db.select().from(users).where(eq(users.email, body.email));
      if (existing?.agencyId && existing.agencyId !== req.agencyId) throw new HttpError(409, "That person already belongs to another agency");
      if (existing) {
        await db
          .update(users)
          .set({ agencyId: req.agencyId, role: body.role, clientId: body.role === "client_viewer" ? body.clientId : null })
          .where(eq(users.id, existing.id));
      } else {
        await db.insert(users).values({ email: body.email, agencyId: req.agencyId, role: body.role, clientId: body.role === "client_viewer" ? body.clientId : null });
      }
      await requestMagicLink(body.email, appUrl(req), "/app");
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "team.invited", entity: "user", meta: { email: body.email, role: body.role } });
      return { ok: true };
    }),
  );

  r.delete(
    "/team/:id",
    requireOwner,
    h(async (req) => {
      const id = param(req, "id");
      if (id === req.user!.id) throw new HttpError(400, "You can't remove yourself");
      await db.delete(users).where(and(eq(users.agencyId, req.agencyId), eq(users.id, id)));
      return { ok: true };
    }),
  );

  r.get("/system-check", requireStaff, h(async () => runSystemCheck()));

  r.get(
    "/ai-usage",
    requireStaff,
    h(async (req) => {
      const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
      const where = and(eq(aiUsage.agencyId, req.agencyId), gte(aiUsage.createdAt, since));
      const byPurpose = await db
        .select({ purpose: aiUsage.purpose, calls: sql<number>`count(*)::int`, tokensIn: sql<number>`sum(${aiUsage.tokensIn})::int`, tokensOut: sql<number>`sum(${aiUsage.tokensOut})::int`, cost: sql<string>`sum(${aiUsage.costUsd})` })
        .from(aiUsage)
        .where(where)
        .groupBy(aiUsage.purpose)
        .orderBy(desc(sql`sum(${aiUsage.costUsd})`));
      const byClient = await db
        .select({ client: clients.name, calls: sql<number>`count(*)::int`, cost: sql<string>`sum(${aiUsage.costUsd})` })
        .from(aiUsage)
        .leftJoin(clients, eq(clients.id, aiUsage.clientId))
        .where(where)
        .groupBy(clients.name);
      return { since, byPurpose, byClient };
    }),
  );

  // ---------- public ----------
  r.get("/public/config", (_req, res) => res.json({ bookDemoUrl: process.env.BOOK_DEMO_URL ?? null }));

  r.post(
    "/public/waitlist",
    h(async (req) => {
      const body = parse(
        z.object({
          email: emailSchema,
          name: z.string().trim().max(120).optional(),
          company: z.string().trim().max(160).optional(),
          locale: z.enum(["en", "ar"]).default("en"),
          wantsDemo: z.boolean().default(false),
        }),
        req.body,
      );
      await db.insert(waitlist).values(body).onConflictDoUpdate({ target: waitlist.email, set: { wantsDemo: body.wantsDemo, company: body.company, name: body.name } });
      return { ok: true };
    }),
  );

  // One-click unsubscribe (RFC 8058 POST) and the link in the List-Unsubscribe header.
  const unsubscribePage = (ok: boolean) =>
    `<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:-apple-system,sans-serif;display:grid;place-items:center;height:90vh;color:#1a1814;background:#f6f4ef"><div style="text-align:center"><h2>${ok ? "You're unsubscribed" : "Link not recognised"}</h2><p>${ok ? "You won't receive further emails from this sender. · لن تصلك رسائل أخرى من هذا المرسل." : ""}</p></div>`;
  r.get(
    "/public/unsubscribe/:token",
    h(async (req, res) => {
      const ok = await unsubscribeByToken(String(req.params.token), "link");
      res.type("html").send(unsubscribePage(ok));
    }),
  );
  r.post(
    "/public/unsubscribe/:token",
    express.urlencoded({ extended: false }),
    h(async (req) => ({ ok: await unsubscribeByToken(String(req.params.token), "one-click") })),
  );

  // Inbound replies (Postmark / Resend inbound / generic JSON). Protected by a shared secret.
  r.post(
    "/inbound",
    h(async (req) => {
      const secret = process.env.INBOUND_WEBHOOK_SECRET;
      if (!secret || (req.query.secret !== secret && req.get("x-inbound-secret") !== secret)) throw new HttpError(401, "Bad inbound secret");
      const mail = parseInbound(req.body as Record<string, unknown>);
      if (!mail) throw new HttpError(400, "No recipient in payload");
      return handleInbound(mail);
    }),
  );
}

/** Stripe needs the raw body; mounted before express.json(). */
export function stripeWebhook(app: express.Express) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    h(async (req) => ({ received: await handleWebhook(req.body as Buffer, req.get("stripe-signature") ?? "") })),
  );
}

