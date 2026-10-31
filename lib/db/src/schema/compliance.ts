import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { agencies, createdAt } from "./core";

// One row per alert delivery attempt (hot-lead alerts and test alerts).
export const alertsLog = pgTable("alerts_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id"),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  score: integer("score"),
  test: text("test"),
  createdAt: createdAt(),
}, t => [index("alerts_log_agency_idx").on(t.agencyId, t.createdAt), index("alerts_log_lead_idx").on(t.agencyId, t.leadId)]);

// Approvals, sends, suppression changes and alert sends.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  target: text("target").notNull().default(""),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("audit_log_agency_idx").on(t.agencyId, t.createdAt)]);
