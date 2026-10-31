import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { Router } from "express";
import { z } from "zod";
import { GULF_COUNTRIES, LANGUAGES, LEAD_STATUSES, REPLY_CLASSES, TEMPERATURES } from "../../shared/enums";
import { requireAgency, requireStaff, requireUser } from "../auth";
import { db } from "../db";
import {
  caseStudies,
  clientAccounts,
  clients,
  companies,
  drafts,
  leads,
  leadSignals,
  mailboxes,
  plays,
  radarSources,
  sends,
  signalDefinitions,
  signals,
  simRuns,
  suppression,
  users,
} from "../db/schema";
import { clientScope, HttpError, h, param, parse } from "../http";
import { audit } from "../lib/audit";
import { suppress } from "../lib/compliance";
import { enqueue, Q } from "../lib/jobs";
import { isPlatformAdmin } from "./core";
import { insertSignal, upsertCompany } from "../services/radar";
import { approveAndSend, cancelSend, SendError, setReplyClass } from "../services/sending";
import { simulateLead, simulateOne } from "../services/simulate";
import { generateDrafts } from "../services/writer";

const requireAdmin = [
  requireUser,
  (req: Parameters<typeof requireUser>[0], res: Parameters<typeof requireUser>[1], next: () => void) =>
    isPlatformAdmin(req.user!.email) ? next() : res.status(403).json({ error: "Platform admins only" }),
];

/** Leads with company + signals, filtered by agency and (for viewers) their client. */
async function leadRows(agencyId: string, filter: { clientId?: string | null; ids?: string[]; status?: string[]; temperature?: string[]; q?: string }) {
  const conds = [eq(leads.agencyId, agencyId)];
  if (filter.clientId) conds.push(eq(leads.clientId, filter.clientId));
  if (filter.ids) conds.push(inArray(leads.id, filter.ids.length ? filter.ids : ["00000000-0000-0000-0000-000000000000"]));
  if (filter.status?.length) conds.push(inArray(leads.status, filter.status as (typeof LEAD_STATUSES)[number][]));
  if (filter.temperature?.length) conds.push(inArray(leads.temperature, filter.temperature as (typeof TEMPERATURES)[number][]));
  if (filter.q) conds.push(or(ilike(leads.fullName, `%${filter.q}%`), ilike(companies.name, `%${filter.q}%`), ilike(leads.title, `%${filter.q}%`))!);
  const rows = await db
    .select({ lead: leads, company: companies, clientName: clients.name })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .innerJoin(clients, eq(clients.id, leads.clientId))
    .where(and(...conds))
    .orderBy(desc(leads.tempScore), desc(leads.updatedAt))
    .limit(300);
  const ids = rows.map((r) => r.lead.id);
  const sigs = ids.length
    ? await db
        .select({ leadId: leadSignals.leadId, id: signals.id, title: signals.title, url: signals.url, source: signals.source, key: signals.definitionKey, name: signalDefinitions.name, detectedAt: signals.detectedAt, language: signals.language })
        .from(leadSignals)
        .innerJoin(signals, eq(signals.id, leadSignals.signalId))
        .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
        .where(inArray(leadSignals.leadId, ids))
        .orderBy(desc(signals.detectedAt))
    : [];
  return rows.map((r) => ({ ...r.lead, company: r.company, clientName: r.clientName, signals: sigs.filter((s) => s.leadId === r.lead.id) }));
}

const draftShape = async (rows: (typeof drafts.$inferSelect)[]) => {
  const ids = rows.map((d) => d.id);
  const runs = ids.length ? await db.select().from(simRuns).where(inArray(simRuns.draftId, ids)).orderBy(asc(simRuns.createdAt)) : [];
  const csIds = rows.map((d) => d.caseStudyId).filter(Boolean) as string[];
  const studies = csIds.length ? await db.select().from(caseStudies).where(inArray(caseStudies.id, csIds)) : [];
  const playIds = rows.map((d) => d.playId).filter(Boolean) as string[];
  const ps = playIds.length ? await db.select({ id: plays.id, name: plays.name }).from(plays).where(inArray(plays.id, playIds)) : [];
  return rows
    .sort((a, b) => a.variant - b.variant)
    .map((d) => ({
      ...d,
      simRuns: runs.filter((r) => r.draftId === d.id),
      caseStudy: studies.find((c) => c.id === d.caseStudyId) ?? null,
      play: ps.find((p) => p.id === d.playId) ?? null,
    }));
};

/** The variant to present for sending: winner, or second-best for the 10% A/B challenger group. */
export function presentedVariant<T extends { status: string; score: number | null }>(ds: T[], abGroup: string): T | undefined {
  const ranked = [...ds].filter((d) => d.status !== "sent").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (abGroup === "challenger" && ranked.length > 1) return ranked[1];
  return ranked.find((d) => d.status === "winner") ?? ranked[0];
}

export function pipelineRoutes(r: Router) {
  // ---------- dashboard ----------
  r.get(
    "/dashboard",
    requireAgency,
    h(async (req) => {
      const clientId = await clientScope(req, (req.query.clientId as string) || null);
      const base = and(eq(leads.agencyId, req.agencyId), clientId ? eq(leads.clientId, clientId) : undefined);
      const temps = await db
        .select({ t: leads.temperature, n: sql<number>`count(*)::int` })
        .from(leads)
        .where(and(base, ne(leads.status, "closed")))
        .groupBy(leads.temperature);
      const [ready] = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(base, eq(leads.status, "ready")));
      const week = new Date(Date.now() - 7 * 86_400_000);
      const sendBase = and(eq(sends.agencyId, req.agencyId), clientId ? eq(sends.clientId, clientId) : undefined);
      const [s] = await db
        .select({
          sent: sql<number>`count(*) filter (where ${sends.status} = 'sent')::int`,
          replies: sql<number>`count(*) filter (where ${sends.replyClass} in ('positive', 'neutral', 'negative'))::int`,
          positive: sql<number>`count(*) filter (where ${sends.replyClass} = 'positive')::int`,
          scheduled: sql<number>`count(*) filter (where ${sends.status} = 'scheduled')::int`,
        })
        .from(sends)
        .where(and(sendBase, gte(sends.createdAt, week)));
      const hot = await leadRows(req.agencyId, { clientId, status: ["ready", "drafted", "new"], temperature: ["hot"] });
      const recent = await db
        .select({ id: signals.id, title: signals.title, url: signals.url, source: signals.source, name: signalDefinitions.name, key: signals.definitionKey, detectedAt: signals.detectedAt, company: companies.name, country: companies.country, language: signals.language })
        .from(signals)
        .innerJoin(companies, eq(companies.id, signals.companyId))
        .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
        .innerJoin(clientAccounts, and(eq(clientAccounts.companyId, companies.id), eq(clientAccounts.agencyId, req.agencyId), clientId ? eq(clientAccounts.clientId, clientId) : undefined))
        .groupBy(signals.id, signalDefinitions.name, companies.name, companies.country)
        .orderBy(desc(signals.detectedAt))
        .limit(8);
      return {
        temperatures: Object.fromEntries(temps.map((t) => [t.t, t.n])),
        ready: ready.n,
        week: s,
        hot: hot.slice(0, 6),
        recentSignals: recent,
      };
    }),
  );

  // ---------- radar ----------
  r.get(
    "/radar",
    requireAgency,
    h(async (req) => {
      const clientId = await clientScope(req, (req.query.clientId as string) || null);
      const accounts = await db
        .select({ account: clientAccounts, company: companies, clientName: clients.name })
        .from(clientAccounts)
        .innerJoin(companies, eq(companies.id, clientAccounts.companyId))
        .innerJoin(clients, eq(clients.id, clientAccounts.clientId))
        .where(and(eq(clientAccounts.agencyId, req.agencyId), clientId ? eq(clientAccounts.clientId, clientId) : undefined))
        .orderBy(desc(clientAccounts.tempScore))
        .limit(200);
      const companyIds = [...new Set(accounts.map((a) => a.company.id))];
      const sigs = companyIds.length
        ? await db
            .select({ id: signals.id, companyId: signals.companyId, title: signals.title, summary: signals.summary, url: signals.url, source: signals.source, key: signals.definitionKey, name: signalDefinitions.name, detectedAt: signals.detectedAt, language: signals.language })
            .from(signals)
            .innerJoin(signalDefinitions, eq(signalDefinitions.key, signals.definitionKey))
            .where(inArray(signals.companyId, companyIds))
            .orderBy(desc(signals.detectedAt))
            .limit(400)
        : [];
      return {
        accounts: accounts.map((a) => ({ ...a.account, company: a.company, clientName: a.clientName, signals: sigs.filter((s) => s.companyId === a.company.id).slice(0, 6) })),
        feed: sigs.slice(0, 60).map((s) => ({ ...s, company: accounts.find((a) => a.company.id === s.companyId)?.company.name })),
      };
    }),
  );

  r.get("/signal-definitions", requireAgency, h(async () => db.select().from(signalDefinitions).orderBy(desc(signalDefinitions.baseWeight))));

  r.patch(
    "/signal-definitions/:id",
    ...requireAdmin,
    h(async (req) => {
      const b = parse(z.object({ name: z.string().min(1).optional(), baseWeight: z.number().int().min(0).max(40).optional(), halfLifeDays: z.number().int().min(1).max(365).optional(), active: z.boolean().optional() }), req.body);
      const [row] = await db.update(signalDefinitions).set(b).where(eq(signalDefinitions.id, param(req, "id"))).returning();
      return row;
    }),
  );

  r.get("/radar-sources", requireStaff, h(async () => db.select().from(radarSources).orderBy(radarSources.job, radarSources.name)));

  r.post(
    "/radar-sources",
    ...requireAdmin,
    h(async (req) => {
      const b = parse(z.object({ name: z.string().min(1), url: z.url(), job: z.enum(["radar-news", "radar-tenders"]) }), req.body);
      const [row] = await db.insert(radarSources).values(b).onConflictDoNothing().returning();
      return row ?? { ok: true };
    }),
  );

  r.patch(
    "/radar-sources/:id",
    ...requireAdmin,
    h(async (req) => {
      const b = parse(z.object({ active: z.boolean() }), req.body);
      const [row] = await db.update(radarSources).set(b).where(eq(radarSources.id, param(req, "id"))).returning();
      return row;
    }),
  );

  r.post(
    "/radar/run/:job",
    ...requireAdmin,
    h(async (req) => {
      const job = String(req.params.job);
      const allowed = [Q.radarNews, Q.radarCareers, Q.radarTenders, Q.radarPeople, Q.thermoDecay] as string[];
      if (!allowed.includes(job)) throw new HttpError(404, "Unknown job");
      await enqueue(job as (typeof Q)[keyof typeof Q], {});
      return { queued: job };
    }),
  );

  /** Manual signal input: a human spotted something; it runs the same pipeline. */
  r.post(
    "/radar/signals",
    requireStaff,
    h(async (req) => {
      const b = parse(
        z.object({
          companyName: z.string().trim().min(1),
          domain: z.string().trim().max(200).optional(),
          country: z.enum(GULF_COUNTRIES),
          definitionKey: z.string().min(1),
          title: z.string().trim().min(3),
          summary: z.string().trim().max(2000).optional(),
          url: z.url().optional().or(z.literal("")),
          language: z.enum(LANGUAGES).default("en"),
          careersUrl: z.url().optional().or(z.literal("")),
        }),
        req.body,
      );
      const [def] = await db.select().from(signalDefinitions).where(eq(signalDefinitions.key, b.definitionKey));
      if (!def) throw new HttpError(400, "Unknown signal type");
      const company = await upsertCompany({ name: b.companyName, domain: b.domain || null, country: b.country });
      if (b.careersUrl) await db.update(companies).set({ careersUrl: b.careersUrl }).where(eq(companies.id, company.id));
      const id = await insertSignal({
        companyId: company.id,
        definitionKey: b.definitionKey,
        title: b.title,
        summary: b.summary ?? null,
        url: b.url || null,
        source: `manual · ${req.user!.email}`,
        language: b.language,
      });
      if (!id) throw new HttpError(409, "That signal is already on the radar");
      return { signalId: id };
    }),
  );

  r.patch(
    "/companies/:id",
    requireStaff,
    h(async (req) => {
      const b = parse(z.object({ careersUrl: z.url().nullable().optional(), domain: z.string().max(200).nullable().optional(), vertical: z.string().max(120).nullable().optional() }), req.body);
      const id = param(req, "id");
      const [owned] = await db.select({ id: clientAccounts.id }).from(clientAccounts).where(and(eq(clientAccounts.agencyId, req.agencyId), eq(clientAccounts.companyId, id))).limit(1);
      if (!owned) throw new HttpError(404, "Company not found");
      const [row] = await db.update(companies).set(b).where(eq(companies.id, id)).returning();
      return row;
    }),
  );

  // ---------- leads ----------
  r.get(
    "/leads",
    requireAgency,
    h(async (req) => {
      const clientId = await clientScope(req, (req.query.clientId as string) || null);
      const split = (v: unknown) => (typeof v === "string" && v ? v.split(",") : undefined);
      return leadRows(req.agencyId, { clientId, status: split(req.query.status), temperature: split(req.query.temperature), q: (req.query.q as string) || undefined });
    }),
  );

  r.get(
    "/leads/:id",
    requireAgency,
    h(async (req) => {
      const id = param(req, "id");
      const clientId = await clientScope(req, null);
      const [lead] = await leadRows(req.agencyId, { ids: [id], clientId });
      if (!lead) throw new HttpError(404, "Lead not found");
      const ds = await draftShape(await db.select().from(drafts).where(and(eq(drafts.agencyId, req.agencyId), eq(drafts.leadId, id))));
      const sendRows = await db
        .select({ send: sends, approver: users.email, mailbox: mailboxes.email })
        .from(sends)
        .leftJoin(users, eq(users.id, sends.approvedBy))
        .leftJoin(mailboxes, eq(mailboxes.id, sends.mailboxId))
        .where(and(eq(sends.agencyId, req.agencyId), eq(sends.leadId, id)))
        .orderBy(desc(sends.createdAt));
      const [account] = lead.accountId ? await db.select().from(clientAccounts).where(eq(clientAccounts.id, lead.accountId)) : [];
      const presented = presentedVariant(ds, lead.abGroup);
      return { lead, account: account ?? null, drafts: ds, presentedDraftId: presented?.id ?? null, sends: sendRows.map((s) => ({ ...s.send, approver: s.approver, mailbox: s.mailbox })) };
    }),
  );

  r.post(
    "/leads/:id/generate",
    requireStaff,
    h(async (req) => {
      const id = param(req, "id");
      const [lead] = await db.select().from(leads).where(and(eq(leads.agencyId, req.agencyId), eq(leads.id, id)));
      if (!lead) throw new HttpError(404, "Lead not found");
      if (["sent", "replied"].includes(lead.status)) throw new HttpError(400, "This lead was already emailed");
      await db.delete(drafts).where(and(eq(drafts.leadId, id), inArray(drafts.status, ["generated", "winner", "edited"])));
      await db.update(leads).set({ status: "new" }).where(eq(leads.id, id));
      await generateDrafts(req.agencyId, id, { queueSimulation: false });
      return simulateLead(req.agencyId, id);
    }),
  );

  r.patch(
    "/leads/:id",
    requireStaff,
    h(async (req) => {
      const b = parse(z.object({ status: z.enum(LEAD_STATUSES).optional(), legalBasis: z.string().max(80).optional(), consentNote: z.string().max(1000).optional(), language: z.enum(LANGUAGES).optional() }), req.body);
      const [row] = await db.update(leads).set(b).where(and(eq(leads.agencyId, req.agencyId), eq(leads.id, param(req, "id")))).returning();
      if (!row) throw new HttpError(404, "Lead not found");
      return row;
    }),
  );

  r.post(
    "/leads/:id/skip",
    requireStaff,
    h(async (req) => {
      const [row] = await db.update(leads).set({ status: "closed" }).where(and(eq(leads.agencyId, req.agencyId), eq(leads.id, param(req, "id")))).returning();
      if (!row) throw new HttpError(404, "Lead not found");
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "lead.skipped", entity: "lead", entityId: row.id });
      return { ok: true };
    }),
  );

  r.post(
    "/leads/:id/suppress",
    requireStaff,
    h(async (req) => {
      const [lead] = await db.select().from(leads).where(and(eq(leads.agencyId, req.agencyId), eq(leads.id, param(req, "id"))));
      if (!lead) throw new HttpError(404, "Lead not found");
      const { scope } = parse(z.object({ scope: z.enum(["email", "domain"]).default("email") }), req.body ?? {});
      if (lead.email) {
        if (scope === "domain") {
          await db.insert(suppression).values({ agencyId: req.agencyId, domain: lead.email.split("@")[1], reason: `Suppressed by ${req.user!.email}` });
        } else {
          await suppress(req.agencyId, lead.email, `Suppressed by ${req.user!.email}`);
        }
      }
      await db.update(leads).set({ status: "closed" }).where(eq(leads.id, lead.id));
      await audit({ agencyId: req.agencyId, userId: req.user!.id, action: "contact.suppressed", entity: "lead", entityId: lead.id, meta: { scope } });
      return { ok: true };
    }),
  );

  // ---------- review & send ----------
  r.get(
    "/review",
    requireAgency,
    h(async (req) => {
      const clientId = await clientScope(req, (req.query.clientId as string) || null);
      const rows = await leadRows(req.agencyId, { clientId, status: ["ready"] });
      const ids = rows.map((l) => l.id);
      const ds = ids.length ? await db.select().from(drafts).where(and(eq(drafts.agencyId, req.agencyId), inArray(drafts.leadId, ids))) : [];
      return rows.map((l) => {
        const mine = ds.filter((d) => d.leadId === l.id);
        const p = presentedVariant(mine, l.abGroup);
        return { ...l, draft: p ? { id: p.id, subject: p.subject, body: p.body, score: p.score, scoreBefore: p.scoreBefore, angle: p.angle, language: p.language, variant: p.variant } : null };
      });
    }),
  );

  r.patch(
    "/drafts/:id",
    requireStaff,
    h(async (req) => {
      const b = parse(z.object({ subject: z.string().trim().min(1).max(300), body: z.string().trim().min(1).max(5000) }), req.body);
      const [row] = await db
        .update(drafts)
        .set({ ...b, status: sql`case when ${drafts.status} = 'winner' then 'winner'::draft_status else 'edited'::draft_status end` })
        .where(and(eq(drafts.agencyId, req.agencyId), eq(drafts.id, param(req, "id")), inArray(drafts.status, ["generated", "winner", "edited"])))
        .returning();
      if (!row) throw new HttpError(404, "Draft not found or already sent");
      return row;
    }),
  );

  r.post(
    "/drafts/:id/simulate",
    requireStaff,
    h(async (req) => {
      await simulateOne(req.agencyId, param(req, "id"));
      const [d] = await db.select().from(drafts).where(eq(drafts.id, param(req, "id")));
      return (await draftShape([d]))[0];
    }),
  );

  /** Swap: make another variant the one presented for sending. */
  r.post(
    "/drafts/:id/choose",
    requireStaff,
    h(async (req) => {
      const [d] = await db.select().from(drafts).where(and(eq(drafts.agencyId, req.agencyId), eq(drafts.id, param(req, "id"))));
      if (!d) throw new HttpError(404, "Draft not found");
      await db.update(drafts).set({ status: "generated" }).where(and(eq(drafts.leadId, d.leadId), eq(drafts.status, "winner")));
      await db.update(drafts).set({ status: "winner" }).where(eq(drafts.id, d.id));
      await db.update(leads).set({ abGroup: "control" }).where(eq(leads.id, d.leadId)); // a human override leaves the A/B test
      return { ok: true };
    }),
  );

  r.post(
    "/drafts/:id/send",
    requireStaff,
    h(async (req) => {
      const b = parse(z.object({ subject: z.string().trim().min(1).max(300).optional(), body: z.string().trim().min(1).max(5000).optional(), confirm: z.literal(true) }), req.body);
      try {
        const s = await approveAndSend(req.agencyId, req.user!.id, param(req, "id"), b.subject && b.body ? { subject: b.subject, body: b.body } : undefined);
        return { sendId: s.id, scheduledFor: s.scheduledFor };
      } catch (e) {
        if (e instanceof SendError) throw new HttpError(400, e.message);
        throw e;
      }
    }),
  );

  r.get(
    "/sends",
    requireAgency,
    h(async (req) => {
      const clientId = await clientScope(req, (req.query.clientId as string) || null);
      const rows = await db
        .select({ send: sends, lead: leads, company: companies, approver: users.email, mailbox: mailboxes.email })
        .from(sends)
        .innerJoin(leads, eq(leads.id, sends.leadId))
        .innerJoin(companies, eq(companies.id, leads.companyId))
        .leftJoin(users, eq(users.id, sends.approvedBy))
        .leftJoin(mailboxes, eq(mailboxes.id, sends.mailboxId))
        .where(and(eq(sends.agencyId, req.agencyId), clientId ? eq(sends.clientId, clientId) : undefined))
        .orderBy(desc(sends.scheduledFor))
        .limit(300);
      return rows.map((r) => ({ ...r.send, lead: { id: r.lead.id, fullName: r.lead.fullName, title: r.lead.title, temperature: r.lead.temperature, tempScore: r.lead.tempScore }, company: r.company.name, approver: r.approver, mailbox: r.mailbox }));
    }),
  );

  r.post("/sends/:id/cancel", requireStaff, h(async (req) => cancelSend(req.agencyId, req.user!.id, param(req, "id"))));

  r.patch(
    "/sends/:id",
    requireStaff,
    h(async (req) => {
      const b = parse(z.object({ replyClass: z.enum(REPLY_CLASSES).optional(), meetingBooked: z.boolean().optional(), bounced: z.boolean().optional() }), req.body);
      const id = param(req, "id");
      if (b.replyClass) await setReplyClass(req.agencyId, req.user!.id, id, b.replyClass);
      if (b.meetingBooked !== undefined) await db.update(sends).set({ meetingBooked: b.meetingBooked }).where(and(eq(sends.agencyId, req.agencyId), eq(sends.id, id)));
      if (b.bounced) {
        await db.update(sends).set({ status: "bounced" }).where(and(eq(sends.agencyId, req.agencyId), eq(sends.id, id)));
        await enqueue(Q.mailboxHealth, {});
      }
      return { ok: true };
    }),
  );

  // ---------- plays ----------
  const playSchema = z.object({
    signalKey: z.string().min(1),
    persona: z.string().trim().min(1).max(60).default("any"),
    vertical: z.string().trim().min(1).max(120).default("any"),
    language: z.enum(LANGUAGES).default("en"),
    name: z.string().trim().min(1).max(160),
    structure: z.string().trim().min(1).max(4000),
    principles: z.string().trim().min(1).max(4000),
  });
  r.get("/plays", requireStaff, h(async (req) => db.select().from(plays).where(eq(plays.agencyId, req.agencyId)).orderBy(plays.signalKey, plays.language)));
  r.post("/plays", requireStaff, h(async (req) => (await db.insert(plays).values({ ...parse(playSchema, req.body), agencyId: req.agencyId }).returning())[0]));
  r.patch(
    "/plays/:id",
    requireStaff,
    h(async (req) => {
      const [row] = await db.update(plays).set(parse(playSchema.partial(), req.body)).where(and(eq(plays.agencyId, req.agencyId), eq(plays.id, param(req, "id")))).returning();
      if (!row) throw new HttpError(404, "Play not found");
      return row;
    }),
  );
  r.delete(
    "/plays/:id",
    requireStaff,
    h(async (req) => {
      await db.delete(plays).where(and(eq(plays.agencyId, req.agencyId), eq(plays.id, param(req, "id"))));
      return { ok: true };
    }),
  );
}
