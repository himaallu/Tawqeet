import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, boolean, jsonb, unique, index, primaryKey, foreignKey, check } from "drizzle-orm/pg-core";
import { agencies, clients, createdAt } from "./core";
import { companies, signals, signalDefinitions } from "./intelligence";

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  companyId: uuid("company_id").notNull(),
  fullName: text("full_name").notNull(),
  title: text("title"),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  emailVerified: boolean("email_verified").notNull().default(false),
  tempScore: integer("temp_score").notNull().default(0),
  temperature: text("temperature", { enum: ["hot", "warm", "cold"] }).notNull().default("cold"),
  whyNow: text("why_now"),
  status: text("status", { enum: ["new", "drafted", "ready", "sent", "replied", "closed"] }).notNull().default("new"),
  createdAt: createdAt(),
}, t => [
  unique("leads_tenant_key").on(t.id, t.agencyId),
  foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [clients.id, clients.agencyId] }).onDelete("cascade"),
  foreignKey({ columns: [t.companyId, t.agencyId], foreignColumns: [companies.id, companies.agencyId] }).onDelete("cascade"),
  index("leads_client_idx").on(t.agencyId, t.clientId),
  check("lead_score_range", sql`${t.tempScore} between 0 and 100`),
  check("lead_temperature_valid", sql`${t.temperature} in ('hot','warm','cold')`),
  check("lead_status_valid", sql`${t.status} in ('new','drafted','ready','sent','replied','closed')`),
]);

export const leadSignals = pgTable("lead_signals", {
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull(),
  signalId: uuid("signal_id").notNull(),
}, t => [
  primaryKey({ columns: [t.leadId, t.signalId] }),
  foreignKey({ columns: [t.leadId, t.agencyId], foreignColumns: [leads.id, leads.agencyId] }).onDelete("cascade"),
  foreignKey({ columns: [t.signalId, t.agencyId], foreignColumns: [signals.id, signals.agencyId] }).onDelete("cascade"),
]);

export const plays = pgTable("plays", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  signalKey: text("signal_key").references(() => signalDefinitions.key),
  persona: text("persona"),
  vertical: text("vertical"),
  language: text("language").notNull().default("en"),
  name: text("name").notNull(),
  structure: text("structure").notNull(),
  principles: text("principles").notNull(),
}, t => [unique("plays_tenant_key").on(t.id, t.agencyId)]);

export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull(),
  variant: integer("variant").notNull(),
  playId: uuid("play_id"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  language: text("language").notNull().default("en"),
  score: integer("score"),
  sim: jsonb("sim").notNull().default({}),
  status: text("status", { enum: ["generated", "winner", "edited", "approved", "sent"] }).notNull().default("generated"),
}, t => [
  unique("drafts_tenant_key").on(t.id, t.agencyId),
  unique("draft_variant_per_lead").on(t.agencyId, t.leadId, t.variant),
  foreignKey({ columns: [t.leadId, t.agencyId], foreignColumns: [leads.id, leads.agencyId] }).onDelete("cascade"),
  foreignKey({ columns: [t.playId, t.agencyId], foreignColumns: [plays.id, plays.agencyId] }),
  check("draft_variant_range", sql`${t.variant} between 1 and 3`),
  check("draft_score_range", sql`${t.score} between 0 and 100`),
  check("draft_status_valid", sql`${t.status} in ('generated','winner','edited','approved','sent')`),
]);

export const simRuns = pgTable("sim_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id").notNull(),
  check: text("check", { enum: ["persona", "gmail_summary", "apple_preview", "spam"] }).notNull(),
  personaName: text("persona_name"),
  result: jsonb("result").notNull(),
  createdAt: createdAt(),
}, t => [foreignKey({ columns: [t.draftId, t.agencyId], foreignColumns: [drafts.id, drafts.agencyId] }).onDelete("cascade"),
  check("sim_check_valid", sql`${t.check} in ('persona','gmail_summary','apple_preview','spam')`)]);
