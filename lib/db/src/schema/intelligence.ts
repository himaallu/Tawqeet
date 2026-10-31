import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, unique, index, foreignKey, check } from "drizzle-orm/pg-core";
import { agencies, clients, createdAt } from "./core";

export const brainEntries = pgTable("brain_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  kind: text("kind", { enum: ["website", "form", "crm", "learning"] }).notNull(),
  content: text("content").notNull(),
  meta: jsonb("meta").notNull().default({}),
  createdAt: createdAt(),
}, t => [
  foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [clients.id, clients.agencyId] }).onDelete("cascade"),
  index("brain_client_idx").on(t.agencyId, t.clientId),
  check("brain_kind_valid", sql`${t.kind} in ('website','form','crm','learning')`),
]);

// Phase 2 field specification was not supplied; this is the documented minimal foundation.
export const caseStudies = pgTable("case_studies", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  title: text("title").notNull(),
  vertical: text("vertical"),
  challenge: text("challenge").notNull().default(""),
  solution: text("solution").notNull().default(""),
  results: jsonb("results").notNull().default({}),
  content: text("content").notNull().default(""),
  sourceUrl: text("source_url"),
  createdAt: createdAt(),
}, t => [foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [clients.id, clients.agencyId] }).onDelete("cascade")]);

// Shared reference catalog, not client data.
export const signalDefinitions = pgTable("signal_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  sourceType: text("source_type", { enum: ["news", "funding", "hiring", "careers_page", "tender", "registry", "leadership"] }).notNull(),
  baseWeight: integer("base_weight").notNull(),
  halfLifeDays: integer("half_life_days").notNull(),
  active: boolean("active").notNull().default(true),
}, t => [check("signal_weight_range", sql`${t.baseWeight} between 0 and 40`), check("signal_half_life_positive", sql`${t.halfLifeDays} > 0`),
  check("signal_source_type_valid", sql`${t.sourceType} in ('news','funding','hiring','careers_page','tender','registry','leadership')`)]);

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain"),
  country: text("country"),
  vertical: text("vertical"),
  sizeBand: text("size_band"),
}, t => [unique("companies_tenant_key").on(t.id, t.agencyId), unique("companies_domain_per_agency").on(t.agencyId, t.domain)]);

export const signals = pgTable("signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull(),
  definitionKey: text("definition_key").notNull().references(() => signalDefinitions.key),
  title: text("title").notNull(),
  url: text("url"),
  source: text("source"),
  language: text("language").notNull().default("en"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  raw: jsonb("raw").notNull().default({}),
}, t => [
  unique("signals_tenant_key").on(t.id, t.agencyId),
  foreignKey({ columns: [t.companyId, t.agencyId], foreignColumns: [companies.id, companies.agencyId] }).onDelete("cascade"),
  index("signals_agency_time_idx").on(t.agencyId, t.detectedAt),
]);
