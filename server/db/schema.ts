/**
 * Tawqeet schema: one file. Edit it, then `npm run db:generate` and commit the SQL in drizzle/.
 *
 * Tenancy: every table holding client data carries `agency_id`, and every query filters by it
 * (routes take it from the session via `req.agencyId`, never from the request body).
 * `companies`, `signals`, `signal_definitions`, `radar_sources` and `enrichment_cache` are
 * shared market data with no client information in them.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ALERT_CHANNELS,
  BRAIN_KINDS,
  CASE_STUDY_SOURCES,
  DRAFT_STATUSES,
  LEAD_STATUSES,
  MAILBOX_PROVIDERS,
  MAILBOX_STATUSES,
  MIN_TEMPERATURES,
  REPLY_CLASSES,
  ROLES,
  SEND_STATUSES,
  SIM_CHECKS,
  SOURCE_TYPES,
  TEMPERATURES,
} from "../../shared/enums";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const textArray = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);
const agencyRef = () =>
  uuid("agency_id")
    .notNull()
    .references(() => agencies.id, { onDelete: "cascade" });
const clientRef = () =>
  uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" });

export const roleEnum = pgEnum("role", ROLES);
export const brainKindEnum = pgEnum("brain_kind", BRAIN_KINDS);
export const sourceTypeEnum = pgEnum("source_type", SOURCE_TYPES);
export const temperatureEnum = pgEnum("temperature", TEMPERATURES);
export const minTemperatureEnum = pgEnum("min_temperature", MIN_TEMPERATURES);
export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);
export const draftStatusEnum = pgEnum("draft_status", DRAFT_STATUSES);
export const simCheckEnum = pgEnum("sim_check", SIM_CHECKS);
export const mailboxProviderEnum = pgEnum("mailbox_provider", MAILBOX_PROVIDERS);
export const mailboxStatusEnum = pgEnum("mailbox_status", MAILBOX_STATUSES);
export const sendStatusEnum = pgEnum("send_status", SEND_STATUSES);
export const replyClassEnum = pgEnum("reply_class", REPLY_CLASSES);
export const alertChannelEnum = pgEnum("alert_channel", ALERT_CHANNELS);
export const caseStudySourceEnum = pgEnum("case_study_source", CASE_STUDY_SOURCES);

// ---------- tenancy + auth ----------

export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("trial"), // trial | agency | canceled
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  extraClients: integer("extra_clients").notNull().default(0),
  simPackCredits: integer("sim_pack_credits").notNull().default(0),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null until an owner creates their agency; invited users get it on invite.
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
    // Set only for role = client_viewer: the one client they may see.
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    name: text("name"),
    role: roleEnum("role").notNull().default("owner"),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [index("users_agency_idx").on(t.agencyId)],
);

/** Magic-link tokens. Only the SHA-256 hash is stored. */
export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/** Sessions in Postgres. `id` is the SHA-256 of the cookie value. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------- clients + brain ----------

export type Icp = {
  titles?: string[];
  seniorities?: string[];
  company_sizes?: string[];
  industries?: string[];
  pains?: string[];
  deal_size?: string;
  notes?: string;
};

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    name: text("name").notNull(),
    website: text("website"),
    verticals: textArray("verticals"),
    regions: textArray("regions"), // ISO alpha-2 Gulf country codes
    languages: textArray("languages"), // en | ar
    offer: text("offer"),
    icp: jsonb("icp").$type<Icp>().notNull().default({}),
    tone: text("tone"),
    noGoClaims: textArray("no_go_claims"),
    proofPoints: textArray("proof_points"),
    differentiators: textArray("differentiators"),
    timezone: text("timezone").notNull().default("Asia/Dubai"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_agency_idx").on(t.agencyId)],
);

export const brainEntries = pgTable(
  "brain_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    kind: brainKindEnum("kind").notNull(),
    content: text("content").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("brain_entries_client_idx").on(t.clientId, t.kind)],
);

export const caseStudies = pgTable(
  "case_studies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    customerName: text("customer_name").notNull(),
    customerVertical: text("customer_vertical"),
    customerCountry: text("customer_country"),
    customerSizeBand: text("customer_size_band"),
    problem: text("problem"),
    solution: text("solution"),
    resultMetric: text("result_metric"),
    resultValue: text("result_value"),
    timeframe: text("timeframe"),
    quote: text("quote"),
    quotePersonTitle: text("quote_person_title"),
    canNameCustomer: boolean("can_name_customer").notNull().default(false),
    language: text("language").notNull().default("en"),
    source: caseStudySourceEnum("source").notNull(),
    sourceRef: text("source_ref"),
    approved: boolean("approved").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("case_studies_client_idx").on(t.clientId)],
);

// ---------- market data (shared) ----------

export const signalDefinitions = pgTable("signal_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  baseWeight: integer("base_weight").notNull(), // 0–40
  halfLifeDays: integer("half_life_days").notNull(),
  active: boolean("active").notNull().default(true),
});

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    domain: text("domain").unique(),
    country: text("country"),
    vertical: text("vertical"),
    sizeBand: text("size_band"),
    careersUrl: text("careers_url"),
    careersHash: text("careers_hash"),
    careersCheckedAt: ts("careers_checked_at"),
    enrichment: jsonb("enrichment").$type<Record<string, unknown>>(),
    enrichedAt: ts("enriched_at"),
    createdAt: createdAt(),
  },
  (t) => [index("companies_name_idx").on(t.name)],
);

export const radarSources = pgTable("radar_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  job: text("job").notNull(), // radar-news | radar-tenders
  active: boolean("active").notNull().default(true),
  lastFetchedAt: ts("last_fetched_at"),
  lastError: text("last_error"),
});

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    definitionKey: text("definition_key").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    url: text("url"),
    source: text("source").notNull(),
    language: text("language").notNull().default("en"),
    detectedAt: ts("detected_at").notNull().defaultNow(),
    dedupeKey: text("dedupe_key").notNull().unique(), // url + company + event_type
    raw: jsonb("raw"),
  },
  (t) => [index("signals_company_idx").on(t.companyId, t.detectedAt)],
);

export const enrichmentCache = pgTable("enrichment_cache", {
  key: text("key").primaryKey(), // e.g. "people:acme.ae:cfo|hr director"
  payload: jsonb("payload").notNull(),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
});

// ---------- accounts, leads, thermometer ----------

export type ScoreBreakdown = {
  signalPoints: number;
  stackBonus: number;
  fitPoints: number;
  engagement: number;
  total: number;
  signals: { id: string; key: string; title: string; points: number; ageDays: number }[];
};

/** A company as seen by one client: ICP fit plus the account-level thermometer. */
export const clientAccounts = pgTable(
  "client_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    fit: integer("fit").notNull().default(0), // 0–25
    fitReason: text("fit_reason"),
    tempScore: integer("temp_score").notNull().default(0),
    temperature: temperatureEnum("temperature").notNull().default("cold"),
    whyNow: text("why_now"),
    breakdown: jsonb("breakdown").$type<ScoreBreakdown>(),
    enrichedAt: ts("enriched_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("client_accounts_uq").on(t.clientId, t.companyId),
    index("client_accounts_agency_idx").on(t.agencyId),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => clientAccounts.id, { onDelete: "set null" }),
    fullName: text("full_name"),
    title: text("title"),
    email: text("email"),
    linkedinUrl: text("linkedin_url"),
    emailVerified: text("email_verified"), // LeadOcean email_status: verified | catch_all_valid
    tempScore: integer("temp_score").notNull().default(0),
    temperature: temperatureEnum("temperature").notNull().default("cold"),
    whyNow: text("why_now"),
    breakdown: jsonb("breakdown").$type<ScoreBreakdown>(),
    status: leadStatusEnum("status").notNull().default("new"),
    language: text("language").notNull().default("en"),
    legalBasis: text("legal_basis").notNull().default("legitimate_interest"),
    consentNote: text("consent_note"),
    abGroup: text("ab_group").notNull().default("control"), // control | challenger (10%)
    lastAlertedAt: ts("last_alerted_at"),
    lastAlertScore: integer("last_alert_score"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leads_agency_idx").on(t.agencyId),
    index("leads_client_idx").on(t.clientId, t.status),
    uniqueIndex("leads_client_email_uq").on(t.clientId, t.email),
  ],
);

export const leadSignals = pgTable(
  "lead_signals",
  {
    agencyId: agencyRef(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.leadId, t.signalId] })],
);

// ---------- writer + simulated inbox ----------

export const plays = pgTable(
  "plays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    signalKey: text("signal_key").notNull(),
    persona: text("persona").notNull().default("any"),
    vertical: text("vertical").notNull().default("any"),
    language: text("language").notNull().default("en"),
    name: text("name").notNull(),
    structure: text("structure").notNull(),
    principles: text("principles").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("plays_agency_idx").on(t.agencyId, t.signalKey)],
);

export type DraftSim = {
  score: number;
  personaAvg: number;
  offerSurvives: number;
  spamRisk: number;
  clarity: number;
  spamFlags: string[];
  gmailSummary?: string;
  applePreview?: string;
  simulatedAt: string;
};

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    variant: integer("variant").notNull(), // 1 | 2 | 3
    playId: uuid("play_id").references(() => plays.id, { onDelete: "set null" }),
    angle: text("angle").notNull(), // outcome | signal | proof
    caseStudyId: uuid("case_study_id").references(() => caseStudies.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    language: text("language").notNull().default("en"),
    score: integer("score"),
    scoreBefore: integer("score_before"), // set when auto-rewritten
    sim: jsonb("sim").$type<DraftSim>(),
    violations: jsonb("violations").$type<string[]>().notNull().default([]),
    status: draftStatusEnum("status").notNull().default("generated"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("drafts_lead_idx").on(t.leadId), index("drafts_agency_idx").on(t.agencyId)],
);

export const simRuns = pgTable(
  "sim_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    check: simCheckEnum("check").notNull(),
    personaName: text("persona_name"),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sim_runs_draft_idx").on(t.draftId), index("sim_runs_agency_idx").on(t.agencyId, t.createdAt)],
);

// ---------- sending ----------

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    provider: mailboxProviderEnum("provider").notNull(),
    email: text("email").notNull(),
    dailyCap: integer("daily_cap").notNull().default(30),
    tokensEncrypted: text("tokens_encrypted"), // AES-256-GCM of {access_token, refresh_token, expires_at}
    status: mailboxStatusEnum("status").notNull().default("connected"),
    pausedReason: text("paused_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("mailboxes_client_idx").on(t.clientId)],
);

export const sends = pgTable(
  "sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "restrict" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "restrict" }),
    // The human who clicked Approve & Send. Required: nothing is sent without one.
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: sendStatusEnum("status").notNull().default("scheduled"),
    scheduledFor: ts("scheduled_for").notNull(),
    sentAt: ts("sent_at"),
    providerMessageId: text("provider_message_id"),
    replyToken: text("reply_token").notNull().unique(),
    repliedAt: ts("replied_at"),
    replyClass: replyClassEnum("reply_class"),
    replyText: text("reply_text"),
    scoreAtSend: integer("score_at_send"),
    abGroup: text("ab_group").notNull().default("control"),
    clicked: boolean("clicked").notNull().default(false),
    meetingBooked: boolean("meeting_booked").notNull().default(false),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sends_draft_uq").on(t.draftId),
    index("sends_mailbox_idx").on(t.mailboxId, t.scheduledFor),
    index("sends_agency_idx").on(t.agencyId, t.createdAt),
  ],
);

export const suppression = pgTable(
  "suppression",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }), // null = global
    email: text("email"),
    domain: text("domain"),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("suppression_email_idx").on(t.email), index("suppression_domain_idx").on(t.domain)],
);

// ---------- alerts ----------

export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    minTemperature: minTemperatureEnum("min_temperature").notNull().default("hot"),
    channel: alertChannelEnum("channel").notNull(),
    target: text("target").notNull(), // email, phone, URL, or PM project/list id
    secretEncrypted: text("secret_encrypted"), // PM API token, encrypted with ENCRYPTION_KEY
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("alert_rules_client_idx").on(t.clientId)],
);

export const alertsSent = pgTable(
  "alerts_sent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    clientId: clientRef(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => alertRules.id, { onDelete: "set null" }),
    channel: text("channel").notNull(), // an alert channel, or digest-warm | summary-cold | report
    tempScore: integer("temp_score"),
    status: text("status").notNull(), // sent | held | bundled | failed
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("alerts_sent_client_idx").on(t.clientId, t.createdAt)],
);

// ---------- ops ----------

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }), // null = shared radar work
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_agency_idx").on(t.agencyId, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyRef(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. send.approved, contact.deleted, mailbox.paused
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_agency_idx").on(t.agencyId, t.createdAt)],
);

export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  company: text("company"),
  locale: text("locale").notNull().default("en"),
  wantsDemo: boolean("wants_demo").notNull().default(false),
  createdAt: createdAt(),
});
