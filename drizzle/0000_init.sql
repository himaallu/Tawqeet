CREATE TYPE "public"."alert_channel" AS ENUM('email', 'sms', 'webhook', 'asana', 'clickup', 'trello');--> statement-breakpoint
CREATE TYPE "public"."brain_kind" AS ENUM('website', 'form', 'crm', 'learning');--> statement-breakpoint
CREATE TYPE "public"."case_study_source" AS ENUM('upload', 'url', 'form', 'website');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('generated', 'winner', 'edited', 'approved', 'sent');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'drafted', 'ready', 'sent', 'replied', 'closed');--> statement-breakpoint
CREATE TYPE "public"."mailbox_provider" AS ENUM('gmail', 'outlook', 'demo');--> statement-breakpoint
CREATE TYPE "public"."mailbox_status" AS ENUM('connected', 'paused', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."min_temperature" AS ENUM('hot', 'warm');--> statement-breakpoint
CREATE TYPE "public"."reply_class" AS ENUM('positive', 'neutral', 'negative', 'ooo', 'unsubscribe');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'member', 'client_viewer');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('scheduled', 'sent', 'failed', 'bounced', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sim_check" AS ENUM('persona', 'gmail_summary', 'apple_preview', 'spam');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('news', 'funding', 'hiring', 'careers_page', 'tender', 'registry', 'leadership');--> statement-breakpoint
CREATE TYPE "public"."temperature" AS ENUM('hot', 'warm', 'cold');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"extra_clients" integer DEFAULT 0 NOT NULL,
	"sim_pack_credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid,
	"client_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"min_temperature" "min_temperature" DEFAULT 'hot' NOT NULL,
	"channel" "alert_channel" NOT NULL,
	"target" text NOT NULL,
	"secret_encrypted" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"lead_id" uuid,
	"rule_id" uuid,
	"channel" text NOT NULL,
	"temp_score" integer,
	"status" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "brain_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "brain_kind" NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"customer_vertical" text,
	"customer_country" text,
	"customer_size_band" text,
	"problem" text,
	"solution" text,
	"result_metric" text,
	"result_value" text,
	"timeframe" text,
	"quote" text,
	"quote_person_title" text,
	"can_name_customer" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"source" "case_study_source" NOT NULL,
	"source_ref" text,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"fit" integer DEFAULT 0 NOT NULL,
	"fit_reason" text,
	"temp_score" integer DEFAULT 0 NOT NULL,
	"temperature" "temperature" DEFAULT 'cold' NOT NULL,
	"why_now" text,
	"breakdown" jsonb,
	"enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"verticals" text[] DEFAULT '{}'::text[] NOT NULL,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"offer" text,
	"icp" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tone" text,
	"no_go_claims" text[] DEFAULT '{}'::text[] NOT NULL,
	"proof_points" text[] DEFAULT '{}'::text[] NOT NULL,
	"differentiators" text[] DEFAULT '{}'::text[] NOT NULL,
	"timezone" text DEFAULT 'Asia/Dubai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"country" text,
	"vertical" text,
	"size_band" text,
	"careers_url" text,
	"careers_hash" text,
	"careers_checked_at" timestamp with time zone,
	"enrichment" jsonb,
	"enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"variant" integer NOT NULL,
	"play_id" uuid,
	"angle" text NOT NULL,
	"case_study_id" uuid,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"score" integer,
	"score_before" integer,
	"sim" jsonb,
	"violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "draft_status" DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_signals" (
	"agency_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	CONSTRAINT "lead_signals_lead_id_signal_id_pk" PRIMARY KEY("lead_id","signal_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid,
	"full_name" text,
	"title" text,
	"email" text,
	"linkedin_url" text,
	"email_verified" text,
	"temp_score" integer DEFAULT 0 NOT NULL,
	"temperature" "temperature" DEFAULT 'cold' NOT NULL,
	"why_now" text,
	"breakdown" jsonb,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"legal_basis" text DEFAULT 'legitimate_interest' NOT NULL,
	"consent_note" text,
	"ab_group" text DEFAULT 'control' NOT NULL,
	"last_alerted_at" timestamp with time zone,
	"last_alert_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"provider" "mailbox_provider" NOT NULL,
	"email" text NOT NULL,
	"daily_cap" integer DEFAULT 30 NOT NULL,
	"tokens_encrypted" text,
	"status" "mailbox_status" DEFAULT 'connected' NOT NULL,
	"paused_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"signal_key" text NOT NULL,
	"persona" text DEFAULT 'any' NOT NULL,
	"vertical" text DEFAULT 'any' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"name" text NOT NULL,
	"structure" text NOT NULL,
	"principles" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radar_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"job" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "radar_sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "send_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"reply_token" text NOT NULL,
	"replied_at" timestamp with time zone,
	"reply_class" "reply_class",
	"reply_text" text,
	"score_at_send" integer,
	"ab_group" text DEFAULT 'control' NOT NULL,
	"clicked" boolean DEFAULT false NOT NULL,
	"meeting_booked" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sends_reply_token_unique" UNIQUE("reply_token")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"base_weight" integer NOT NULL,
	"half_life_days" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "signal_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"definition_key" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text,
	"source" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text NOT NULL,
	"raw" jsonb,
	CONSTRAINT "signals_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "sim_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"check" "sim_check" NOT NULL,
	"persona_name" text,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid,
	"email" text,
	"domain" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid,
	"client_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'owner' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"wants_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entries" ADD CONSTRAINT "brain_entries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entries" ADD CONSTRAINT "brain_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_studies" ADD CONSTRAINT "case_studies_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_studies" ADD CONSTRAINT "case_studies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_case_study_id_case_studies_id_fk" FOREIGN KEY ("case_study_id") REFERENCES "public"."case_studies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_signals" ADD CONSTRAINT "lead_signals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_signals" ADD CONSTRAINT "lead_signals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_signals" ADD CONSTRAINT "lead_signals_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_client_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."client_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_runs" ADD CONSTRAINT "sim_runs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_runs" ADD CONSTRAINT "sim_runs_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_agency_idx" ON "ai_usage" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "alert_rules_client_idx" ON "alert_rules" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "alerts_sent_client_idx" ON "alerts_sent" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_agency_idx" ON "audit_log" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "brain_entries_client_idx" ON "brain_entries" USING btree ("client_id","kind");--> statement-breakpoint
CREATE INDEX "case_studies_client_idx" ON "case_studies" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_accounts_uq" ON "client_accounts" USING btree ("client_id","company_id");--> statement-breakpoint
CREATE INDEX "client_accounts_agency_idx" ON "client_accounts" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "clients_agency_idx" ON "clients" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "drafts_lead_idx" ON "drafts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "drafts_agency_idx" ON "drafts" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "leads_agency_idx" ON "leads" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "leads_client_idx" ON "leads" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_client_email_uq" ON "leads" USING btree ("client_id","email");--> statement-breakpoint
CREATE INDEX "mailboxes_client_idx" ON "mailboxes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "plays_agency_idx" ON "plays" USING btree ("agency_id","signal_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sends_draft_uq" ON "sends" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "sends_mailbox_idx" ON "sends" USING btree ("mailbox_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "sends_agency_idx" ON "sends" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signals_company_idx" ON "signals" USING btree ("company_id","detected_at");--> statement-breakpoint
CREATE INDEX "sim_runs_draft_idx" ON "sim_runs" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "sim_runs_agency_idx" ON "sim_runs" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "suppression_email_idx" ON "suppression" USING btree ("email");--> statement-breakpoint
CREATE INDEX "suppression_domain_idx" ON "suppression" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "users_agency_idx" ON "users" USING btree ("agency_id");