import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import type { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ALERT_CHANNELS, GULF_COUNTRIES, LANGUAGES, MIN_TEMPERATURES } from "../../shared/enums";
import { requireAgency, requireStaff } from "../auth";
import { db } from "../db";
import { alertRules, brainEntries, caseStudies, clients, leads, mailboxes } from "../db/schema";
import { HttpError, h, param, parse, requireClient } from "../http";
import { audit } from "../lib/audit";
import { encryptJson } from "../lib/crypto";
import { documentText } from "../lib/documents";
import { COUNTRY_TZ } from "../lib/gulf-time";
import { scrape } from "../lib/scrape";
import { deliver } from "../services/alerts";
import { crawlWebsite, extractCaseStudies, onboardingSchema, recentLearnings, saveCaseStudy, saveOnboardingForm } from "../services/brain";
import { hubspotAuthorizeUrl, hubspotConfigured, importWonDeals } from "../services/hubspot";
import { authorizeUrl, completeOAuth, signState, verifyState } from "../services/mailboxes";
import { assertCanAddClient } from "../services/usage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const list = z.array(z.string().trim().min(1).max(200)).max(50);
const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  website: z.url("Website must be a full URL, e.g. https://example.ae").or(z.literal("")).nullable().optional(),
  verticals: list.default([]),
  regions: z.array(z.enum(GULF_COUNTRIES)).default([]),
  languages: z.array(z.enum(LANGUAGES)).default(["en"]),
  offer: z.string().trim().max(4000).nullable().optional(),
  tone: z.string().trim().max(500).nullable().optional(),
  noGoClaims: list.default([]),
  proofPoints: list.default([]),
  differentiators: list.default([]),
  icp: z
    .object({
      titles: list.optional(),
      seniorities: list.optional(),
      company_sizes: list.optional(),
      industries: list.optional(),
      pains: list.optional(),
      deal_size: z.string().max(200).optional(),
      notes: z.string().max(4000).optional(),
    })
    .default({}),
});

const caseStudyFields = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerVertical: z.string().trim().max(120).nullable().optional(),
  customerCountry: z.string().trim().max(60).nullable().optional(),
  customerSizeBand: z.string().trim().max(40).nullable().optional(),
  problem: z.string().trim().max(2000).nullable().optional(),
  solution: z.string().trim().max(2000).nullable().optional(),
  resultMetric: z.string().trim().max(500).nullable().optional(),
  resultValue: z.string().trim().max(120).nullable().optional(),
  timeframe: z.string().trim().max(120).nullable().optional(),
  quote: z.string().trim().max(1000).nullable().optional(),
  quotePersonTitle: z.string().trim().max(200).nullable().optional(),
  canNameCustomer: z.boolean().optional(),
  language: z.enum(LANGUAGES).optional(),
  approved: z.boolean().optional(),
});

export function clientRoutes(r: Router) {
  r.get(
    "/clients",
    requireAgency,
    h(async (req) => {
      const where =
        req.user!.role === "client_viewer" ? and(eq(clients.agencyId, req.agencyId), eq(clients.id, req.user!.clientId!)) : eq(clients.agencyId, req.agencyId);
      const rows = await db.select().from(clients).where(where).orderBy(asc(clients.name));
      const counts = await db
        .select({ clientId: leads.clientId, temperature: leads.temperature, n: count() })
        .from(leads)
        .where(and(eq(leads.agencyId, req.agencyId), ne(leads.status, "closed")))
        .groupBy(leads.clientId, leads.temperature);
      const ready = await db
        .select({ clientId: leads.clientId, n: count() })
        .from(leads)
        .where(and(eq(leads.agencyId, req.agencyId), eq(leads.status, "ready")))
        .groupBy(leads.clientId);
      return rows.map((c) => ({
        ...c,
        counts: Object.fromEntries(counts.filter((x) => x.clientId === c.id).map((x) => [x.temperature, Number(x.n)])),
        ready: Number(ready.find((x) => x.clientId === c.id)?.n ?? 0),
      }));
    }),
  );

  r.post(
    "/clients",
    requireStaff,
    h(async (req) => {
      await assertCanAddClient(req.agencyId);
      const body = parse(clientSchema, req.body);
      const timezone = COUNTRY_TZ[body.regions[0] ?? "AE"] ?? "Asia/Dubai";
      const [c] = await db
        .insert(clients)
        .values({ ...body, website: body.website || null, agencyId: req.agencyId, timezone })
        .returning();
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "client.created", entity: "client", entityId: c.id });
      return c;
    }),
  );

  r.get("/clients/:id", requireAgency, h(async (req) => requireClient(req, param(req, "id"))));

  r.patch(
    "/clients/:id",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const body = parse(clientSchema.partial(), req.body);
      const timezone = body.regions?.length ? (COUNTRY_TZ[body.regions[0]] ?? c.timezone) : c.timezone;
      const [row] = await db
        .update(clients)
        .set({ ...body, website: body.website === undefined ? undefined : body.website || null, timezone, icp: body.icp ? { ...c.icp, ...body.icp } : undefined })
        .where(and(eq(clients.agencyId, req.agencyId), eq(clients.id, c.id)))
        .returning();
      return row;
    }),
  );

  r.delete(
    "/clients/:id",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      await db.delete(clients).where(and(eq(clients.agencyId, req.agencyId), eq(clients.id, c.id)));
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "client.deleted", entity: "client", entityId: c.id, meta: { name: c.name } });
      return { ok: true };
    }),
  );

  // ---------- brain ----------
  r.get(
    "/clients/:id/brain",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const entries = await db
        .select()
        .from(brainEntries)
        .where(and(eq(brainEntries.agencyId, req.agencyId), eq(brainEntries.clientId, c.id), inArray(brainEntries.kind, ["website", "form", "crm"])))
        .orderBy(desc(brainEntries.createdAt))
        .limit(100);
      const learnings = await db
        .select()
        .from(brainEntries)
        .where(and(eq(brainEntries.agencyId, req.agencyId), eq(brainEntries.clientId, c.id), eq(brainEntries.kind, "learning")))
        .orderBy(desc(brainEntries.createdAt))
        .limit(50);
      const studies = await db
        .select()
        .from(caseStudies)
        .where(and(eq(caseStudies.agencyId, req.agencyId), eq(caseStudies.clientId, c.id)))
        .orderBy(desc(caseStudies.createdAt));
      return { client: c, entries, learnings, caseStudies: studies, crm: { hubspot: hubspotConfigured() }, writerLearnings: (await recentLearnings(req.agencyId, c.id, null)).length };
    }),
  );

  r.post(
    "/clients/:id/brain/crawl",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const { url } = parse(z.object({ url: z.url("Enter the full website URL") }), req.body);
      const result = await crawlWebsite(req.agencyId, c.id, url);
      if (!c.website) await db.update(clients).set({ website: url }).where(eq(clients.id, c.id));
      return { pages: result.pages, caseStudies: result.extracted.case_studies.length };
    }),
  );

  r.post(
    "/clients/:id/brain/form",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      await saveOnboardingForm(req.agencyId, c.id, parse(onboardingSchema, req.body));
      return { ok: true };
    }),
  );

  r.post(
    "/clients/:id/brain/crm/hubspot",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      if (!hubspotConfigured()) return { comingSoon: true };
      return { url: hubspotAuthorizeUrl({ agencyId: req.agencyId, clientId: c.id, userId: req.user!.id }) };
    }),
  );

  r.get(
    "/oauth/hubspot/callback",
    h(async (req, res) => {
      const state = verifyState(String(req.query.state ?? ""));
      if (!state) throw new HttpError(400, "Sign-in expired. Try again.");
      const n = await importWonDeals(state, String(req.query.code ?? ""));
      res.redirect(`/app/clients/${state.clientId}/brain?crm=${n}`);
    }),
  );

  // ---------- case studies ----------
  const addExtracted = async (agencyId: string, clientId: string, text: string, source: "upload" | "url" | "form", ref: string | null) => {
    if (text.trim().length < 40) throw new HttpError(400, "Couldn't find enough text to read a case study from");
    const found = await extractCaseStudies(agencyId, clientId, text);
    return Promise.all(found.map((cs) => saveCaseStudy(agencyId, clientId, cs, source, ref)));
  };

  r.post(
    "/clients/:id/case-studies/upload",
    requireStaff,
    upload.single("file"),
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      if (!req.file) throw new HttpError(400, "Attach a file");
      const text = await documentText(req.file.buffer, req.file.originalname, req.file.mimetype).catch((e: Error) => {
        throw new HttpError(400, e.message);
      });
      return addExtracted(req.agencyId, c.id, text, "upload", req.file.originalname);
    }),
  );

  r.post(
    "/clients/:id/case-studies/url",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const { url } = parse(z.object({ url: z.url() }), req.body);
      const page = await scrape(url).catch((e: Error) => {
        throw new HttpError(400, e.message);
      });
      return addExtracted(req.agencyId, c.id, `${page.title}\n${page.text}`, "url", url);
    }),
  );

  r.post(
    "/clients/:id/case-studies",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const f = parse(caseStudyFields, req.body);
      const [row] = await db
        .insert(caseStudies)
        .values({ ...f, agencyId: req.agencyId, clientId: c.id, source: "form", approved: f.approved ?? false, canNameCustomer: f.canNameCustomer ?? false, language: f.language ?? "en" })
        .returning();
      return row;
    }),
  );

  r.patch(
    "/case-studies/:id",
    requireStaff,
    h(async (req) => {
      const f = parse(caseStudyFields.partial(), req.body);
      const [row] = await db
        .update(caseStudies)
        .set(f)
        .where(and(eq(caseStudies.agencyId, req.agencyId), eq(caseStudies.id, param(req, "id"))))
        .returning();
      if (!row) throw new HttpError(404, "Case study not found");
      if (f.approved !== undefined) {
        await audit({ agencyId: req.agencyId, userId: req.user!.id, action: f.approved ? "case_study.approved" : "case_study.unapproved", entity: "case_study", entityId: row.id });
      }
      return row;
    }),
  );

  r.delete(
    "/case-studies/:id",
    requireStaff,
    h(async (req) => {
      await db.delete(caseStudies).where(and(eq(caseStudies.agencyId, req.agencyId), eq(caseStudies.id, param(req, "id"))));
      return { ok: true };
    }),
  );

  // ---------- alert rules ----------
  const ruleSchema = z.object({
    minTemperature: z.enum(MIN_TEMPERATURES),
    channel: z.enum(ALERT_CHANNELS),
    target: z.string().trim().min(1, "Target is required").max(500),
    token: z.string().trim().max(500).optional(),
    active: z.boolean().default(true),
  });
  const shapeRule = (r: typeof alertRules.$inferSelect) => ({ ...r, secretEncrypted: undefined, hasToken: !!r.secretEncrypted });

  r.get(
    "/clients/:id/alert-rules",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const rows = await db.select().from(alertRules).where(and(eq(alertRules.agencyId, req.agencyId), eq(alertRules.clientId, c.id))).orderBy(alertRules.createdAt);
      return rows.map(shapeRule);
    }),
  );

  r.post(
    "/clients/:id/alert-rules",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const b = parse(ruleSchema, req.body);
      if (["asana", "clickup", "trello"].includes(b.channel) && !b.token) throw new HttpError(400, "Add the API token for this tool");
      if (b.channel === "webhook" && !/^https:\/\//.test(b.target)) throw new HttpError(400, "Webhook URL must start with https://");
      const [row] = await db
        .insert(alertRules)
        .values({ agencyId: req.agencyId, clientId: c.id, minTemperature: b.minTemperature, channel: b.channel, target: b.target, active: b.active, secretEncrypted: b.token ? encryptJson({ token: b.token }) : null })
        .returning();
      return shapeRule(row);
    }),
  );

  r.patch(
    "/alert-rules/:id",
    requireStaff,
    h(async (req) => {
      const b = parse(ruleSchema.partial(), req.body);
      const [row] = await db
        .update(alertRules)
        .set({ ...b, token: undefined, ...(b.token ? { secretEncrypted: encryptJson({ token: b.token }) } : {}) } as Partial<typeof alertRules.$inferInsert>)
        .where(and(eq(alertRules.agencyId, req.agencyId), eq(alertRules.id, param(req, "id"))))
        .returning();
      if (!row) throw new HttpError(404, "Rule not found");
      return shapeRule(row);
    }),
  );

  r.delete(
    "/alert-rules/:id",
    requireStaff,
    h(async (req) => {
      await db.delete(alertRules).where(and(eq(alertRules.agencyId, req.agencyId), eq(alertRules.id, param(req, "id"))));
      return { ok: true };
    }),
  );

  r.post(
    "/alert-rules/:id/test",
    requireStaff,
    h(async (req) => {
      const [rule] = await db.select().from(alertRules).where(and(eq(alertRules.agencyId, req.agencyId), eq(alertRules.id, param(req, "id"))));
      if (!rule) throw new HttpError(404, "Rule not found");
      try {
        await deliver(rule, "🔥 Test alert from Tawqeet", "This is a test. Real alerts include the lead, the signals and a link to review the drafts.", { test: true });
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      return { ok: true };
    }),
  );

  // ---------- mailboxes ----------
  const shapeMailbox = (m: typeof mailboxes.$inferSelect) => ({ ...m, tokensEncrypted: undefined });

  r.get(
    "/clients/:id/mailboxes",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const rows = await db.select().from(mailboxes).where(and(eq(mailboxes.agencyId, req.agencyId), eq(mailboxes.clientId, c.id)));
      return {
        mailboxes: rows.map(shapeMailbox),
        providers: {
          gmail: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
          outlook: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
          demo: process.env.NODE_ENV !== "production",
        },
      };
    }),
  );

  r.post(
    "/clients/:id/mailboxes/connect",
    requireStaff,
    h(async (req) => {
      const c = await requireClient(req, param(req, "id"));
      const { provider, email } = parse(z.object({ provider: z.enum(["gmail", "outlook", "demo"]), email: z.email().optional() }), req.body);
      if (provider === "demo") {
        if (process.env.NODE_ENV === "production") throw new HttpError(400, "Demo mailboxes are disabled in production");
        const [row] = await db
          .insert(mailboxes)
          .values({ agencyId: req.agencyId, clientId: c.id, provider: "demo", email: email ?? `outreach@${(c.website ?? "client.example").replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}` })
          .returning();
        return { mailbox: shapeMailbox(row) };
      }
      try {
        return { url: authorizeUrl(provider, signState({ agencyId: req.agencyId, clientId: c.id, userId: req.user!.id })) };
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    }),
  );

  r.get(
    "/oauth/:provider/callback",
    h(async (req, res) => {
      const provider = req.params.provider;
      if (provider !== "gmail" && provider !== "outlook") throw new HttpError(404, "Not found");
      const state = verifyState(String(req.query.state ?? ""));
      if (!state) return res.redirect("/app/settings/mailboxes?error=expired");
      if (req.query.error) return res.redirect(`/app/settings/mailboxes?error=${encodeURIComponent(String(req.query.error))}`);
      try {
        const id = await completeOAuth(provider, String(req.query.code ?? ""), state);
        await audit({ agencyId: state.agencyId, userId: state.userId, action: "mailbox.connected", entity: "mailbox", entityId: id, meta: { provider } });
        res.redirect(`/app/settings/mailboxes?client=${state.clientId}&connected=1`);
      } catch (e) {
        res.redirect(`/app/settings/mailboxes?client=${state.clientId}&error=${encodeURIComponent((e as Error).message)}`);
      }
    }),
  );

  r.patch(
    "/mailboxes/:id",
    requireStaff,
    h(async (req) => {
      const b = parse(z.object({ dailyCap: z.number().int().min(1).max(200).optional(), status: z.enum(["connected", "paused"]).optional() }), req.body);
      const [row] = await db
        .update(mailboxes)
        .set({ ...b, ...(b.status === "connected" ? { pausedReason: null } : b.status === "paused" ? { pausedReason: "Paused by a team member" } : {}) })
        .where(and(eq(mailboxes.agencyId, req.agencyId), eq(mailboxes.id, param(req, "id"))))
        .returning();
      if (!row) throw new HttpError(404, "Mailbox not found");
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "mailbox.updated", entity: "mailbox", entityId: row.id, meta: b });
      return shapeMailbox(row);
    }),
  );

  r.delete(
    "/mailboxes/:id",
    requireStaff,
    h(async (req) => {
      const id = param(req, "id");
      await db.update(mailboxes).set({ status: "revoked", tokensEncrypted: null }).where(and(eq(mailboxes.agencyId, req.agencyId), eq(mailboxes.id, id)));
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "mailbox.disconnected", entity: "mailbox", entityId: id });
      return { ok: true };
    }),
  );
}
