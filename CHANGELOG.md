## 2026-10-31 — Signal definitions

- Installed the 20 definitions from `docs/Tawqeet_Signal_Definitions.md`, upserted by key.
- Applied the requested overrides: `hiring_sales_role` 35 points / 30 days; `hiring_surge` 30 points / 21 days.
- Added descriptions, source arrays, EN/AR keywords, exclusions, personas, vertical multipliers, play hints, negative flags and company/industry scope.
- Replaced obsolete placeholder keys without deleting their signal evidence or play references.
- Added Settings → Signals editing, immediate lead re-scoring, time decay, score caps and per-lead source evidence.
- Added definition-driven GCC classification, RSS/exchange-news collection, page-diff watching and weekly LeadOcean/CRM champion checks. External collectors require their documented configuration; no credentials or feeds are invented.
- No authentication, email-delivery, ownership, outbound sending or unrelated feature changes.

# Changelog

## 2026-10-31 — Part 3: checks, integrations, mailbox sending, final audit

- `.env.example` lists every variable the app reads, grouped and marked required/optional.
- `pnpm run check:env`: missing required vars, then live PASS/FAIL/SKIP for database, AI provider, Gemini, LeadOcean, Resend (test email), alert webhook (test POST), Stripe link, HubSpot, Firecrawl, Trello, Twilio, Asana, ClickUp. Values are never printed.
- Settings → System checks → "Run live checks" shows the same (read-only calls; no email/webhook sent).
- `pnpm run smoke`: demo login → Load demo data → Autobia/Foodics Hot → drafts + simulation → rewrite → Approve & Send → test alert → digest → read-only share link → gmail.com blocked. Missing services are SKIP.
- Direct Trello cards, Twilio SMS, Asana and ClickUp tasks for Hot leads when their env vars exist; Make webhook stays the default. Real status and test per channel on Settings → Alerts.
- Gmail (gmail.send only) and Outlook (Mail.Send) OAuth with AES-256-GCM encrypted refresh tokens; Settings → Mailboxes shows redirect URIs and enables Connect when configured. `REAL_SEND=true` sends to the actual lead through the connected mailbox (approval, compliance and cap still apply).
- Inbound reply capture: `POST /api/webhooks/inbound` (Resend inbound, Svix-verified with `INBOUND_WEBHOOK_SECRET`) matches replies to sends by sender + subject, classifies positive/neutral/negative/ooo/unsubscribe with AI (heuristic fallback), records the reply (Brain learning via trigger) and suppresses unsubscribes. Manual Mark reply is kept.
- `AUDIT.md` and `docs/REPLIT_DEPLOY.md`.
- Merged the Part 2 commits that were pushed after PR #2 was merged.

## 2026-10-31 — Finish demo, part 2: operations and data rights

- Worker digests (Asia/Dubai): `alerts-warm-digest` 08:30 Mon–Fri lists Warm leads not yet digested; `alerts-cold-weekly` 08:30 Monday (first UAE workday) summarises the Cold watchlist. "Send digest now" on Settings → Alerts.
- Auto-pause: marking a bounce, spam complaint or unsubscribe re-checks the client's day; >3% bounces or 3+ unsubscribes/complaints pauses sending for that client (banner + Resume on Review & Send, audited).
- Plan limits: 6th client and simulated emails beyond 300/month return HTTP 402 with an Upgrade prompt (clients form, lead actions, Billing notice).
- Contact data rights on the lead page: Export contact data (JSON) and Delete contact (cascade delete, anonymised audit row and earlier audit rows scrubbed, email suppressed).
- Client read-only view: `client_viewer` users scoped to one client (`users.client_id`) see only `/reports` (their stats and sent emails). Reports → Share read-only link creates a 7-day `/share/{token}` link.
- Settings → Mailboxes placeholder (Gmail/Outlook, send-only scopes, "Coming next"). No OAuth.
- Plays page (`/plays`): one editable play per signal and language (EN/AR).
- Reports: client filter, sent emails, calibration, and an A/B toggle that sends the second-best variant for ~10% of approvals, with per-arm reply rates.
- Additive DB: `agencies.ab_test_enabled`, `users.client_id`, `clients.sending_paused_at/sending_paused_reason`, `sends.delivery_event/ab_arm`, `share_links`; mirrored in `scripts/demo.sql`.

## 2026-10-31 — Finish demo: Review & Send, alerts, billing, compliance, landing

- `/review`: ready emails across demo leads with a side panel (editable winner, switchable variants, simulated inbox). Approve & Send delivers via Resend **only** to `ALERT_EMAIL_TO`/`OWNER_EMAIL` with a `[Demo · to …]` subject prefix, List-Unsubscribe header and opt-out line; records approver and time in `sends`. Blocks free-mail, suppressed contacts, missing opt-out and over the 30/day cap.
- Reply marking (positive/neutral/negative/unsubscribe) writes Brain learnings; unsubscribe adds to suppression.
- Hot-lead alerts after scoring (Load demo data, radar, manual signal): email + `ALERT_WEBHOOK_URL` JSON; 7-day dedupe unless score rises 15+; `alerts_log` table. `/settings/alerts` with channel status, test alerts and log.
- `/settings/billing` (USD 399/month, 5 clients, +USD 59/extra, usage, Stripe Payment Link), `/settings/compliance` (rules, address check, suppression list, `audit_log`), `/reports` (sends, positive per 100, top signals, calibration).
- Public bilingual `/welcome` landing page (EN/AR, RTL) linked from login. Legal basis shown on leads.
- Additive DB changes mirrored in `scripts/demo.sql` (run by `scripts/migrate-demo.ts`).

## 2026-10-31 — Phase 2: client Brain

- Per-client editable onboarding/profile, website crawl and evidence extraction using the server-only AI SDK.
- First-class case studies: short form, public URL, PDF/DOCX/PPTX upload, draft review, explicit approval and customer naming permission.
- Private App Storage with tenant-owned upload references; public URL fetching blocks private/reserved destinations and DNS rebinding.
- Contacts/won-deals CSV imports with deduplication, plus HubSpot companies and closed-won deals through private-token or connected access. Client OAuth remains a stub.
- Atomic Postgres trigger captures reply-classification changes as learnings, with a last-50 client/vertical retrieval boundary.
- Future writer context excludes unapproved evidence and anonymises private customers before prompting.
- System checks now cover Brain AI, private storage, HubSpot access and the learning trigger.
- Backend regression coverage for network safety, document parsing, CSVs, trigger semantics, writer evidence filtering, learning limits and deduplication.
- No radar, lead discovery, writer, outbound sending or automatic CRM sync added.

## 2026-10-31 — Phase 0: foundation

### Built

- Approved React/Vite + Express/TypeScript project setup; Tailwind/shadcn shell and Arabic-ready content fields.
- All requested Drizzle tables, tenant IDs, tenant-safe foreign keys, enum/value constraints, and authentication/session/rate-limit support tables.
- Single agency with two demo client profiles; persistent create, view, edit and owner-only delete flows.
- Twelve placeholder signal definitions with the supplied weights and half-lives.
- Idempotent offline fixture seed with ten fictional Gulf signals, leads and three drafts per lead. No send side effects.
- Resend-connected email magic links, atomic one-time redemption, hashed Postgres sessions, origin protection, throttling and owner-only initial access.
- Agency Settings and owner-only System check, showing green/red configuration states without disclosing secrets.
- Separate pg-boss worker, authentication cleanup schedule, real heartbeat diagnostics, and compiled production worker supervision.
- Server-only Vercel AI SDK entry point and AI usage accounting foundation, without enabling AI features.
- Empty environment-name template, safe ignore rules, README and product-docs folder.

### Still missing / deliberately not enabled

- Live email delivery and signed-in UI have not been exercised automatically; sign-in requires the owner to request and redeem a real link.
- A verified sender domain is needed for users beyond Resend's test-sender recipient restrictions.
- Final Phase 2 case-study field definitions were not supplied.
- Radar, leads/enrichment/scoring, Brain, Plays, AI drafting/simulation, mailboxes, outbound sending, replies, alerts and billing remain future phases.
- Full auth and tenant-isolation regression suites and real production publishing are not included in Phase 0.
