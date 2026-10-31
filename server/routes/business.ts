import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { Router } from "express";
import { z } from "zod";
import { PLAN } from "../../shared/enums";
import { appUrl, requireAgency, requireOwner, requireStaff } from "../auth";
import { db } from "../db";
import { agencies, auditLog, suppression, users } from "../db/schema";
import { clientScope, HttpError, h, param, parse, requireClient } from "../http";
import { audit } from "../lib/audit";
import { FREE_MAIL_DOMAINS } from "../lib/compliance";
import { checkout, portal, setExtraClients } from "../services/billing";
import { deleteContact, exportContact } from "../services/contacts";
import { calibration, weeklyReport } from "../services/reports";
import { usageFor } from "../services/usage";

export function businessRoutes(r: Router) {
  // ---------- reports ----------
  r.get(
    "/clients/:id/report",
    requireAgency,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const [agency] = await db.select({ name: agencies.name }).from(agencies).where(eq(agencies.id, req.agencyId));
      return { agency: agency.name, client: { id: c.id, name: c.name }, ...(await weeklyReport(req.agencyId, c.id)) };
    }),
  );

  r.get(
    "/calibration",
    requireStaff,
    h(async (req) => calibration(req.agencyId, (await clientScope(req, (req.query.clientId as string) || null)) ?? undefined)),
  );

  // ---------- billing ----------
  r.get(
    "/billing",
    requireOwner,
    h(async (req) => {
      const [a] = await db.select().from(agencies).where(eq(agencies.id, req.agencyId));
      return {
        plan: PLAN,
        agency: { plan: a.plan, status: a.subscriptionStatus, extraClients: a.extraClients, simPackCredits: a.simPackCredits, hasCustomer: !!a.stripeCustomerId },
        usage: await usageFor(req.agencyId),
        configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_AGENCY),
      };
    }),
  );

  const billingCall = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  };

  r.post(
    "/billing/checkout",
    requireOwner,
    h(async (req) => {
      const b = parse(z.object({ kind: z.enum(["plan", "sim_pack"]), quantity: z.number().int().min(1).max(20).default(1) }), req.body);
      return { url: await billingCall(() => checkout(req.agencyId, req.user!.email, b.kind, `${appUrl(req)}/app/settings/billing`, b.quantity)) };
    }),
  );

  r.post(
    "/billing/extra-clients",
    requireOwner,
    h(async (req) => {
      const { extra } = parse(z.object({ extra: z.number().int().min(0).max(100) }), req.body);
      await billingCall(() => setExtraClients(req.agencyId, req.user!.id, extra));
      return { ok: true };
    }),
  );

  r.post("/billing/portal", requireOwner, h(async (req) => ({ url: await billingCall(() => portal(req.agencyId, `${appUrl(req)}/app/settings/billing`)) })));

  // ---------- compliance ----------
  r.get(
    "/suppression",
    requireStaff,
    h(async (req) =>
      db
        .select()
        .from(suppression)
        .where(or(eq(suppression.agencyId, req.agencyId), isNull(suppression.agencyId)))
        .orderBy(desc(suppression.createdAt))
        .limit(500),
    ),
  );

  r.post(
    "/suppression",
    requireStaff,
    h(async (req) => {
      const b = parse(
        z.object({ email: z.email().optional(), domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a domain like example.ae").optional(), reason: z.string().trim().min(1).max(300) }).refine((v) => v.email || v.domain, "Enter an email or a domain"),
        req.body,
      );
      const [row] = await db
        .insert(suppression)
        .values({ agencyId: req.agencyId, email: b.email?.toLowerCase() ?? null, domain: b.domain?.toLowerCase() ?? null, reason: b.reason })
        .returning();
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "suppression.added", entity: "suppression", entityId: row.id });
      return row;
    }),
  );

  r.delete(
    "/suppression/:id",
    requireOwner,
    h(async (req) => {
      const id = param(req, "id");
      await db.delete(suppression).where(and(eq(suppression.agencyId, req.agencyId), eq(suppression.id, id)));
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "suppression.removed", entity: "suppression", entityId: id });
      return { ok: true };
    }),
  );

  r.get(
    "/contacts/export",
    requireStaff,
    h(async (req, res) => {
      const email = parse(z.email(), req.query.email);
      const data = await exportContact(req.agencyId, email);
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "contact.exported", entity: "contact", meta: { domain: email.split("@")[1] } });
      res.setHeader("content-disposition", `attachment; filename="contact-export.json"`);
      return data;
    }),
  );

  r.delete(
    "/contacts",
    requireOwner,
    h(async (req) => deleteContact(req.agencyId, req.user!.id, parse(z.object({ email: z.email() }), req.body).email)),
  );

  r.get(
    "/audit",
    requireStaff,
    h(async (req) =>
      db
        .select({ log: auditLog, email: users.email })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.userId))
        .where(eq(auditLog.agencyId, req.agencyId))
        .orderBy(desc(auditLog.createdAt))
        .limit(300)
        .then((rows) => rows.map((r) => ({ ...r.log, userEmail: r.email }))),
    ),
  );

  r.get("/compliance/free-mail-domains", requireStaff, (_req, res) => res.json([...FREE_MAIL_DOMAINS].sort()));
}
