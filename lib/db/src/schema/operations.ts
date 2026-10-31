import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, timestamp, numeric, boolean, unique, foreignKey, check } from "drizzle-orm/pg-core";
import { agencies, clients, createdAt } from "./core";
import { drafts } from "./outbound";

export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  provider: text("provider", { enum: ["gmail", "outlook"] }).notNull(),
  email: text("email").notNull(),
  dailyCap: integer("daily_cap").notNull().default(30),
  tokensEncrypted: text("tokens_encrypted").notNull(),
  status: text("status").notNull().default("disconnected"),
}, t => [
  unique("mailboxes_tenant_key").on(t.id, t.agencyId),
  foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [clients.id, clients.agencyId] }).onDelete("cascade"),
  check("mailbox_cap_positive", sql`${t.dailyCap} > 0`),
  check("mailbox_provider_valid", sql`${t.provider} in ('gmail','outlook')`),
]);

export const sends = pgTable("sends", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id").notNull(),
  mailboxId: uuid("mailbox_id").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  providerMessageId: text("provider_message_id"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  replyClass: text("reply_class", { enum: ["positive", "neutral", "negative", "ooo", "unsubscribe"] }),
}, t => [
  foreignKey({ columns: [t.draftId, t.agencyId], foreignColumns: [drafts.id, drafts.agencyId] }).onDelete("cascade"),
  foreignKey({ columns: [t.mailboxId, t.agencyId], foreignColumns: [mailboxes.id, mailboxes.agencyId] }).onDelete("cascade"),
  unique("sends_draft_once").on(t.agencyId, t.draftId),
  check("send_reply_class_valid", sql`${t.replyClass} in ('positive','neutral','negative','ooo','unsubscribe')`),
]);

export const alertRules = pgTable("alert_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  minTemperature: text("min_temperature", { enum: ["hot", "warm"] }).notNull(),
  channel: text("channel", { enum: ["email", "sms", "webhook", "asana", "clickup", "trello"] }).notNull(),
  target: text("target").notNull(),
  active: boolean("active").notNull().default(true),
}, t => [foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [clients.id, clients.agencyId] }).onDelete("cascade"),
  check("alert_temperature_valid", sql`${t.minTemperature} in ('hot','warm')`),
  check("alert_channel_valid", sql`${t.channel} in ('email','sms','webhook','asana','clickup','trello')`)]);

export const suppression = pgTable("suppression", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
  email: text("email"),
  domain: text("domain"),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
}, t => [check("suppression_has_target", sql`${t.email} is not null or ${t.domain} is not null`)]);

export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id"),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  tokensIn: integer("tokens_in").notNull(),
  tokensOut: integer("tokens_out").notNull(),
  // Null means pricing unconfigured, never silently report zero cost.
  costUsd: numeric("cost_usd", { precision: 14, scale: 8 }),
  createdAt: createdAt(),
}, t => [
  foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [clients.id, clients.agencyId] }).onDelete("cascade"),
  check("ai_tokens_nonnegative", sql`${t.tokensIn} >= 0 and ${t.tokensOut} >= 0`),
]);

export const workerHeartbeat = pgTable("worker_heartbeat", {
  id: text("id").primaryKey(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
});
