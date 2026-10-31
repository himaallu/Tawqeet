# Changelog

## 2026-10-31: Phases 0–7

Rebuilt on the stack in `docs/` (React + Vite + Express), replacing the first Next.js scaffold.

**Phase 0 — setup.** Vite + Express in one project, Tailwind v4, Drizzle, pg-boss worker as a second process, `lib/ai.ts` with per-call usage + cost logging and an offline mode, `scrape.ts` (fetch + cheerio → Firecrawl, robots.txt), README, `.env.example`, `docs/`, scripts `dev/worker/build/start/db:migrate/db:seed/lint`.

**Phase 1 — data model, auth, workspaces.** All tables from the brief plus sessions, magic-link tokens, client accounts (per-client thermometer), alert log, enrichment cache, audit log, waitlist. Every client-data table carries `agency_id`. Magic-link sign-in (hashed tokens, Postgres sessions), one agency per owner, members and read-only client viewers. App shell with the sidebar from the brief plus Overview, Calibration and Reports.

**Phase 2 — Brain.** Website crawl (homepage + up to 10 same-domain pages) → AI profile + case studies; onboarding form; HubSpot won-deal import ("coming soon" without keys); case studies from PDF/DOCX/PPTX upload, URL, form or crawl, usable only once approved, anonymised when the customer can't be named; a learning written for every reply class.

**Phase 3 — radar, thermometer, alerts.** `radar-news` (RSS + Google News per client vertical, every 30 min 07:00–22:00 GST, hourly overnight), `radar-careers` (02:00, hash-skips unchanged pages), `radar-tenders` (06:00), `radar-people` (Sunday 01:00, LeadOcean funding + C-suite diff), `thermo-decay` (01:30). Event-driven pipeline per signal: classify → ICP fit → thermometer → LeadOcean contacts (verified emails only, 30-day cache, 429 back-off) → drafts → simulation → ready → alert. Thermometer exactly as specified. Alerts by email, SMS (Twilio, held outside 08:00–21:00 local), webhook, Asana, ClickUp, Trello; max 5 hot alerts per client per day then bundled; warm digest 08:30 on UAE/KSA workdays; weekly cold summary; 7-day / +15 repeat rule. Manual "Add signal" for anything the radar misses.

**Phase 4 — writer.** Play library (12 signals × English + native Arabic), editable. Three variants (outcome-, signal-, proof-led) using the brain, the last 50 learnings and 1–2 matched approved case studies. Hard rules enforced after generation: no no-go claims, no numbers outside the brain/case studies/signal, mandatory opt-out line.

**Phase 5 — simulated inbox.** Six personas, Gmail-style summary, lock-screen preview, spam rules (EN+AR) + model check, the weighted 0–100 score, winner selection, one auto-rewrite below 60 with before/after scores. Calibration page (reply rate by score bucket per vertical) and the 10% A/B second-best group.

**Phase 6 — Review & Send.** Ready queue per client with thermometer, signals, why-now, winning variant and score; side panel with editable email, the other variants and the simulated inbox. Approve & send (explicit confirm), edit, swap variant, skip, suppress. Gmail (`gmail.send`) and Outlook (`Mail.Send`) send-only OAuth with grants refused if they include more; daily caps; random 2–6 minute gaps; List-Unsubscribe + one-click; reply tracking via per-send alias and inbound webhook, AI reply class, forward to the real mailbox. Client-viewer role and white-label weekly report.

**Phase 7 — billing, compliance, launch.** Stripe: Agency plan, extra clients, simulation packs, limits enforced (trial: 2 clients / 100 simulations). Free-mail blocking, global + agency suppression, consent / legal-basis note per lead, per-contact export and erasure, audit log of every approval, mailbox auto-pause at >3% bounces or a spam-complaint signal. Landing page in English and Arabic with waitlist and Book a demo.

**Verified:** 27 automated tests (rules + full API pipeline from signal to reply), typecheck, lint, production build; every page rendered at desktop and 390px phone width in light and dark mode.

**Still missing / needs live accounts**
- No live keys were used: Resend, LeadOcean, Gmail/Outlook, Twilio, Asana/ClickUp/Trello, HubSpot and Stripe calls are built from their docs but untested against real accounts.
- LeadOcean `profile_data` field names (job title, LinkedIn URL) aren't published in the OpenAPI schema; the adapter tries several names. Check against one live response.
- Replit's Resend connection is read via the connectors API; confirm on Replit.
- Bounce detection relies on DSNs reaching the reply alias or a manual "mark bounced"; a provider bounce webhook would be more complete.
- RSS feed URLs in the seed may move; failing sources show their last error.
- Launch checklist items in `docs/` (Google verification for `gmail.send`, UAE SMS sender ID, PDPL legal review, final signal list).
