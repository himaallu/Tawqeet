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
  index("brain_learning_vertical_idx").on(t.agencyId, t.clientId, sql`lower(${t.meta}->>'vertical')`, t.createdAt.desc()).where(sql`${t.kind} = 'learning'`),
  check("brain_kind_valid", sql`${t.kind} in ('website','form','crm','learning')`),
]);

// Legacy foundation columns are retained so schema upgrades do not discard existing data.
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
  customerName: text("customer_name").notNull().default(""),
  customerVertical: text("customer_vertical").notNull().default(""),
  customerCountry: text("customer_country").notNull().default(""),
  customerSizeBand: text("customer_size_band").notNull().default(""),
  problem: text("problem").notNull().default(""),
  resultMetric: text("result_metric").notNull().default(""),
  resultValue: text("result_value").notNull().default(""),
  timeframe: text("timeframe").notNull().default(""),
  quote: text("quote").notNull().default(""),
  quotePersonTitle: text("quote_person_title").notNull().default(""),
  canNameCustomer: boolean("can_name_customer").notNull().default(false),
  language: text("language").notNull().default("en"),
  source: text("source", { enum: ["upload", "url", "form", "website"] }).notNull().default("form"),
  sourceRef: text("source_ref"),
  approved: boolean("approved").notNull().default(false),
  createdAt: createdAt(),
}, t => [
  foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [clients.id, clients.agencyId] }).onDelete("cascade"),
  index("case_studies_client_idx").on(t.agencyId, t.clientId),
  check("case_source_valid", sql`${t.source} in ('upload','url','form','website')`),
  check("case_language_valid", sql`${t.language} in ('en','ar')`),
]);

export const brainUploads = pgTable("brain_uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: createdAt(),
}, t => [foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [clients.id, clients.agencyId] }).onDelete("cascade")]);

// Shared reference catalog, not client data.
export const signalDefinitions = pgTable("signal_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  description: text("description").notNull().default(""),
  sourceTypes: text("source_types").array().notNull().default([]),
  verticalMultipliers: jsonb("vertical_multipliers").$type<{ saas: number; re: number; hr: number }>().notNull().default({ saas: 1, re: 1, hr: 1 }),
  targetPersonas: text("target_personas").array().notNull().default([]),
  keywordsEn: text("keywords_en").array().notNull().default([]),
  keywordsAr: text("keywords_ar").array().notNull().default([]),
  exclusions: text("exclusions").array().notNull().default([]),
  playHint: text("play_hint").notNull().default(""),
  isNegative: boolean("is_negative").notNull().default(false),
  scope: text("scope", { enum: ["company", "industry"] }).notNull().default("company"),
  baseWeight: integer("base_weight").notNull(),
  halfLifeDays: integer("half_life_days").notNull(),
  active: boolean("active").notNull().default(true),
}, t => [check("signal_weight_range", sql`${t.baseWeight} between -40 and 40`), check("signal_half_life_positive", sql`${t.halfLifeDays} > 0`),
  check("signal_scope_valid", sql`${t.scope} in ('company','industry')`)]);

export const companies = pgTable("companies", {
  radarMeta: jsonb("radar_meta").$type<Record<string, any>>().notNull().default({}),
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
  companyId: uuid("company_id"),
  definitionKey: text("definition_key").notNull().references(() => signalDefinitions.key),
  scope: text("scope", { enum: ["company", "industry"] }).notNull().default("company"),
  affectedIndustries: text("affected_industries").array().notNull().default([]),
  affectedCountries: text("affected_countries").array().notNull().default([]),
  evidenceQuote: text("evidence_quote").notNull().default(""),
  externalKey: text("external_key"),
  title: text("title").notNull(),
  url: text("url"),
  source: text("source"),
  language: text("language").notNull().default("en"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  raw: jsonb("raw").notNull().default({}),
}, t => [
  unique("signals_tenant_key").on(t.id, t.agencyId),
  unique("signals_external_per_agency").on(t.agencyId, t.externalKey),
  check("signal_company_scope", sql`(${t.scope} = 'company' and ${t.companyId} is not null) or (${t.scope} = 'industry' and ${t.companyId} is null and cardinality(${t.affectedIndustries}) > 0 and cardinality(${t.affectedCountries}) > 0)`),
  foreignKey({ columns: [t.companyId, t.agencyId], foreignColumns: [companies.id, companies.agencyId] }).onDelete("cascade"),
  index("signals_agency_time_idx").on(t.agencyId, t.detectedAt),
]);

export const signalSnapshots = pgTable("signal_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull(),
  url: text("url").notNull(),
  text: text("text").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
}, t => [
  unique("signal_snapshot_url").on(t.agencyId, t.url),
  foreignKey({ columns: [t.companyId, t.agencyId], foreignColumns: [companies.id, companies.agencyId] }).onDelete("cascade"),
]);

export const signalReceipts = pgTable("signal_receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [unique("signal_receipt_per_agency").on(t.agencyId, t.fingerprint)]);
