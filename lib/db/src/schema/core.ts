import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, jsonb, unique, index, integer, check, boolean } from "drizzle-orm/pg-core";

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const agencies = pgTable("agencies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("foundation"),
  abTestEnabled: boolean("ab_test_enabled").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: createdAt(),
  // Phase 0 supports exactly one agency. Remove this constraint only with onboarding.
  workspaceSlot: integer("workspace_slot").notNull().default(1),
}, t => [unique("one_agency_per_workspace").on(t.workspaceSlot), check("agency_slot_singleton", sql`${t.workspaceSlot} = 1`)]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["owner", "member", "client_viewer"] }).notNull().default("member"),
  // Set only for client_viewer users: the single client whose report they may see.
  clientId: uuid("client_id"),
}, t => [unique("users_tenant_key").on(t.id, t.agencyId), index("users_agency_idx").on(t.agencyId),
  check("user_role_valid", sql`${t.role} in ('owner','member','client_viewer')`)]);

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  website: text("website").notNull().default(""),
  verticals: text("verticals").array().notNull().default(sql`'{}'::text[]`),
  regions: text("regions").array().notNull().default(sql`'{}'::text[]`),
  languages: text("languages").array().notNull().default(sql`'{English}'::text[]`),
  offer: text("offer").notNull().default(""),
  icp: jsonb("icp").$type<Record<string, unknown>>().notNull().default({}),
  tone: text("tone").notNull().default(""),
  proofPoints: text("proof_points").array().notNull().default(sql`'{}'::text[]`),
  differentiators: text("differentiators").array().notNull().default(sql`'{}'::text[]`),
  noGoClaims: text("no_go_claims").array().notNull().default(sql`'{}'::text[]`),
  sendingPausedAt: timestamp("sending_paused_at", { withTimezone: true }),
  sendingPausedReason: text("sending_paused_reason"),
  createdAt: createdAt(),
}, t => [unique("clients_tenant_key").on(t.id, t.agencyId), index("clients_agency_idx").on(t.agencyId)]);

export const magicLinks = pgTable("magic_links", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, t => [index("magic_links_expiry_idx").on(t.expiresAt)]);

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, t => [index("sessions_expiry_idx").on(t.expiresAt)]);

export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(1),
  resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
});
