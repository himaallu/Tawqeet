# Tawqeet — Replit Agent build prompts

How to use: paste **Phase 0** into Replit Agent first, then one phase at a time. Test each phase before pasting the next. Phases 1–6 make the hackathon demo; Phase 7 makes it launchable.

Agent mode per phase (Plan Mode on, auto-approve plans off): Phase 0+1 **Power** (or Free) · Phase 2 **Power** · Phase 3 **Max** · Phases 4+5 **Max** · Phase 6 **Max** · Phase 7 **Power** · seed data **Power** · small fixes **Free**. If Power fails twice on the same error, roll back and retry once in Max.

Git routine: right after Phase 0 (or Prompt A), connect the project to a new **private** GitHub repo `tawqeet` from Replit's **Tools → Git**. After every phase: test → Agent updates CHANGELOG/README → **Commit & Push** with the message Agent suggests. Put this file and the PRD in `docs/`.

---

## Phase 0 — Context (paste first)

You are building **Tawqeet**, a multi-tenant SaaS for B2B outbound agencies in the UAE/GCC. It watches Gulf business signals, finds the right lead, scores how "hot" the lead is, writes 3 email variants, tests them on a simulated AI inbox, and lets the agency's client review and send from their own mailbox.

Stack (do not change):
- React + Vite front end + Express + TypeScript API server in the same project (Replit's default web stack) + Tailwind + shadcn/ui
- Postgres (Replit) with Drizzle ORM
- Auth: email magic link sent through Replit's Resend connection; sessions stored in Postgres (no passwords, no Replit Auth)
- Background jobs: **pg-boss** (a job queue that lives in the same Postgres; no Redis). Run two processes from one repo: `web` (Express serving the API and the built Vite app) and `worker` (`worker/index.ts`, Node). Deploy on a **Replit Reserved VM** (always on), not Autoscale, so long jobs and schedules aren't cut off. Use pg-boss schedules for recurring jobs (radar every 30 min, nightly thermometer decay).
- All AI calls go through one server module `server/lib/ai.ts` built on the **Vercel AI SDK** (`generateObject` with zod schemas), so providers can be swapped by env var: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Log tokens and cost per call to an `ai_usage` table (agency_id, client_id, purpose, model, tokens_in, tokens_out, cost_usd).
- Fetching web pages: plain `fetch` + `cheerio` first; if a page needs JavaScript, fall back to a hosted scraper behind `server/lib/scrape.ts` (e.g. `FIRECRAWL_API_KEY`). Respect robots.txt.
- RTL support for Arabic text (`dir="auto"` on email bodies).

Rules:
- Every table that holds client data has `agency_id` and is filtered by it on every query.
- Never store passwords. Encrypt OAuth tokens at rest (`ENCRYPTION_KEY`).
- No email is ever sent without a human clicking Send.
- Keep a `seed.ts` that creates a demo agency, 2 clients, 10 Gulf signals, leads and drafts so the demo works offline.

GitHub (the project is connected to a private GitHub repo through Replit's Git tool):
- Create a `.gitignore` that excludes `.env*`, `node_modules`, `.next`, `uploads/`, `*.log`, and any local database files. Never write secrets into files; read them only from `process.env`.
- Create `README.md` with: what Tawqeet is, the stack, how to run locally (`npm install`, `npm run dev`, `npm run worker`), the list of required environment variables with one line each (names only, no values), and a "Build status" checklist of Phases 0–7.
- Create `.env.example` listing every environment variable name with empty values.
- Create a `docs/` folder. I will add the build prompts and PRD there.
- Create `CHANGELOG.md`. At the end of every phase, add an entry (date, phase, what was built, what's still missing) and tick the phase in the README checklist.
- Keep scripts in `package.json`: `dev`, `worker`, `build`, `start` (starts web + worker together), `db:migrate`, `db:seed`, `lint`.
- At the end of every phase, tell me: "Ready to commit: <suggested commit message>" so I can commit and push from the Git tool.

---

## Phase 1 — Data model, auth, workspaces

Create these Drizzle tables and a basic app shell (sidebar: Radar, Leads, Review & Send, Brain, Plays, Settings).

- `agencies` (id, name, plan, stripe_customer_id, created_at)
- `users` (id, agency_id, email, role: owner|member|client_viewer)
- `clients` (id, agency_id, name, website, verticals[], regions[], languages[], offer, icp jsonb, tone, no_go_claims[], created_at)
- `brain_entries` (id, client_id, kind: website|form|crm|learning, content text, meta jsonb, created_at)
- `case_studies` (see Phase 2 for fields)
- `signal_definitions` (id, key, name, source_type: news|funding|hiring|careers_page|tender|registry|leadership, base_weight 0–40, half_life_days, active)
- `companies` (id, name, domain, country, vertical, size_band)
- `signals` (id, company_id, definition_key, title, url, source, language, detected_at, raw jsonb)
- `leads` (id, agency_id, client_id, company_id, full_name, title, email, linkedin_url, email_verified, temp_score int, temperature: hot|warm|cold, why_now text, status: new|drafted|ready|sent|replied|closed, created_at)
- `lead_signals` (lead_id, signal_id)
- `plays` (id, signal_key, persona, vertical, language, name, structure text, principles text)
- `drafts` (id, lead_id, variant 1|2|3, play_id, subject, body, language, score int, sim jsonb, status: generated|winner|edited|approved|sent)
- `sim_runs` (id, draft_id, check: persona|gmail_summary|apple_preview|spam, persona_name, result jsonb, created_at)
- `mailboxes` (id, client_id, provider: gmail|outlook, email, daily_cap default 30, tokens_encrypted, status)
- `sends` (id, draft_id, mailbox_id, sent_at, provider_message_id, replied_at, reply_class: positive|neutral|negative|ooo|unsubscribe)
- `alert_rules` (id, client_id, min_temperature: hot|warm, channel: email|sms|webhook|asana|clickup|trello, target, active)
- `suppression` (id, agency_id nullable for global, email, domain, reason, created_at)
- `ai_usage` (see Phase 0). Jobs are handled by pg-boss, which creates its own tables.

Seed `signal_definitions` with placeholders (the founders will replace with their list):
funding_round 35/30d · expansion_new_market 30/45d · hiring_sales_role 25/30d · hiring_relevant_role 25/30d · careers_page_new_roles 20/21d · leadership_change 30/60d · tender_published 35/21d · new_company_registration 15/90d · product_launch 20/30d · partnership_announced 20/30d · event_exhibitor (e.g. GITEX, Cityscape) 20/14d · office_opening 25/45d.

---

## Phase 2 — The Brain (client knowledge base)

Build the **Brain** page per client with three inputs:
1. **Website crawl**: input URL → fetch homepage + up to 10 internal pages (same domain) → AI extracts `{offer, icp, proof_points[], case_studies[], tone, differentiators[], no_go_claims[]}` → saved as `brain_entries(kind=website)` and merged into `clients`.
2. **Onboarding form**: who you sell to, deal size, top 3 pains you solve, proof/case studies, words to never use, languages (EN/AR).
3. **CRM connect** (stub now): HubSpot OAuth button that imports won deals and their industries as `brain_entries(kind=crm)`. If no keys, show "coming soon".

**Learning from day one:** every time a `sends` row gets `reply_class`, write a `brain_entries(kind=learning)` row: `{signal_key, play_id, persona, vertical, language, subject, score, reply_class}`. The writer (Phase 4) reads the last 50 learnings for that client and vertical.

**Case studies (first-class part of the Brain):**
- New table `case_studies` (id, client_id, customer_name, customer_vertical, customer_country, customer_size_band, problem, solution, result_metric text, result_value text, timeframe, quote, quote_person_title, can_name_customer bool, language, source: upload|url|form|website, source_ref, approved bool, created_at).
- Ways to add: upload PDF/DOCX/slides, paste a URL, fill a short form, or auto-extracted from the website crawl. AI extracts the fields above; a human must tick **Approved** before the writer can use it.
- If `can_name_customer` is false, the writer must anonymise ("a Dubai logistics company with 200 staff").
- Show a Case Studies tab in the Brain with cards (customer, vertical, result, approved badge).

Show the Brain as an editable profile card plus a "What we've learned" list.

---

## Phase 3 — Signal radar + thermometer + hot-lead alerts

**Collection schedule (all times Gulf Standard Time, pg-boss schedules in the worker):**

| Job | Source | When | Notes |
|---|---|---|---|
| `radar-news` | RSS: news, funding, launches, partnerships, office openings, events | Every 30 min 07:00–22:00, hourly overnight | Cheap; speed matters for news |
| `radar-careers` | Tracked companies' careers pages | Daily 02:00 | fetch first, Firecrawl only for JS pages; skip if page hash unchanged |
| `radar-tenders` | Tender portals and company registries | Daily 06:00 | Ready before the morning digest |
| `radar-people` | Enrichment API: leadership and job changes for tracked accounts | Weekly, Sunday 01:00 | Uses paid credits, so weekly |
| `enrich-contacts` | Enrichment API: find the right person | On demand, only when a company turns Warm or Hot for a client | Cache results 30 days per domain to save credits |
| `thermo-decay` | Recompute every lead's score | Nightly 01:30 | Old signals cool down |

**Pipeline per new signal (event-driven, not scheduled):** ingest → dedupe → AI classify → match to each client's ICP → recompute thermometer → if Warm/Hot: `enrich-contacts` → `generateDrafts` → `simulate` → status `ready` → `alert`.

**Delivery cadence:**
- **Hot:** alert as soon as drafts are ready (target under 15 minutes from detection). PM task and email anytime; SMS only 08:00–21:00 in the client's time zone, otherwise held until 08:00. Max 5 individual hot alerts per client per day; more are bundled into one message.
- **Warm:** no instant alert. One daily digest email at 08:30 on the client's workdays (UAE Mon–Fri, KSA Sun–Thu), plus the dashboard "Ready" queue.
- **Cold:** no alert. Dashboard watchlist only, plus a weekly summary on the first workday. If a cold lead turns warm or hot, it follows those rules.
- No repeat alert for the same lead within 7 days unless its score rises by 15+.

**Radar job details** (`radar-news`, `radar-careers`, `radar-tenders`, `radar-people`):
- Sources: RSS feeds (Zawya, Gulf News business, The National business, Wamda, MAGNiTT news, Arabian Business, Google News RSS queries per client vertical + "UAE"/"Saudi"), and a careers-page watcher (for companies in `companies` with a known careers URL: fetch, hash the job list, detect new roles).
- For each new item: AI extracts `{company_name, domain_guess, country, event_type ∈ signal_definitions.key, summary, language, is_gulf: bool}`. Drop if not Gulf or not matching an active definition. Upsert `companies`, insert `signals` (dedupe by url + company + event_type).

**Lead finding (LeadOcean):** for each signal matching a client's ICP (AI fit check returns `fit 0–25` + reason), find the right people through an adapter `server/lib/enrichment.ts` backed by **LeadOcean**:
- Base URL `https://api.leadocean.io`, header `x-api-key: ${LEADOCEAN_API_KEY}`. Before coding, read `https://api.leadocean.io/openapi.json` (and `/v1/filters`, `/v1/enums`) to get the exact parameter names; do not guess them.
- `POST /v1/companies/enrich` with the company domain → size, industry, country, tech (used for the ICP fit check).
- `GET /v1/companies/{domain}/people` → people at the company; filter to the client's target titles/seniority. If the domain is unknown, use `POST /v1/people/search` with company name + country.
- Use `?count=true&limit=1` first to check there are matches before pulling rows.
- Keep only contacts whose email status is verified/valid (read the status values from `/v1/enums`); store the status in `leads.email_verified`.
- Respect rate limits (back off on 429). Cache results per domain for 30 days.
- `radar-people` weekly job: use LeadOcean's hiring, funding and executive filters for companies in the clients' target countries and verticals as an extra signal source.
- Keep the adapter interface `findPeople({domain, company, country, titles[]})` and `enrichCompany(domain)` so the provider can be swapped. Skip anyone on `suppression`.

**Thermometer (0–100):**
```
signal_points = Σ over the lead's company signals of base_weight × 0.5^(age_days / half_life_days)   (cap 50)
stack_bonus   = +10 if 2+ different signal types in 30 days, +15 if 3+
fit_points    = AI ICP fit (0–25)
engagement    = +15 if they replied before, +5 if they clicked, 0 otherwise (cap 15)
temp_score    = min(100, signal_points + stack_bonus + fit_points + engagement)
Hot ≥ 70 · Warm 40–69 · Cold < 40
```
Recompute nightly (`thermo-decay`) and immediately on every new signal for that company. Show a thermometer badge on each lead (red/amber/blue) with a tooltip that lists the contributing signals.

**Alerts:** when a lead crosses into the temperature set in `alert_rules`, send:
- **email** via Resend (`RESEND_API_KEY`) to the agency/client,
- **SMS** via Twilio (`TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`),
- **webhook** POST `{lead, company, signals, temp_score, why_now, dashboard_url}`,
- **project management**: create a task in Asana / ClickUp / Trello (API token + list/project id stored per client) titled `🔥 {company} — {why_now}` with the lead details and a link back.
Never alert the same lead twice within 7 days unless the score rises by 15+.

---

## Phase 4 — Writer (3 variants per lead)

**Play library** (`plays` table + Plays page, editable). Seed one play per signal_definition with these principles, for English and Arabic:
- First line: a specific, true observation tied to the signal (never generic flattery).
- One quantified, believable outcome relevant to the lead's role.
- Under 120 words. Plain text. One link max.
- One small, specific ask (e.g. "a 15-minute call Tuesday or Wednesday?").
- Subject line: short, specific to their situation, no clickbait.
- Follow-ups (later): shorter than the first email, stop on reply.
- Arabic plays are written natively in Modern Standard Arabic with a respectful GCC business tone, not translated.

**Generation** (`generateDrafts(lead_id)` job, runs automatically for Warm and Hot leads):
- Input: client brain (profile + last 50 learnings), lead, company, signals, why_now, matching plays (by signal_key → persona → vertical → language).
- Case study matching: pick the 1–2 approved case studies closest to the lead (same vertical first, then same country, then similar size or same problem as the signal implies). Pass them to the writer.
- Output: 3 variants with different angles (outcome-led, signal-led, proof-led using the matched case study), each `{subject, body, play_id, angle, language, case_study_id|null}`.
- Any number or result in an email must come from an approved case study or the brain; otherwise rewrite without it. Show which case study each variant used in the review panel.
- Hard rules checked after generation: no claims from `no_go_claims`, no invented numbers that aren't in the brain, includes an opt-out line ("Not relevant? Reply 'stop' and I won't email again.").

---

## Phase 5 — Simulated inbox (5+ personas, weighted score)

`simulate(draft_id)` runs these checks in parallel and stores each in `sim_runs`:

1. **Persona panel (6 personas)**, each a small/cheap model call returning `{action: reply|read_ignore|skip|spam, reply_likelihood 0–1, reason, what_would_make_me_reply}`:
   - The target lead (built from title, company, signals)
   - Busy C-level executive in the GCC
   - Skeptical buyer who gets 20 cold emails a day
   - Executive assistant / gatekeeper
   - AI email assistant agent that triages on the user's behalf (decides surface / summarise / archive)
   - Arabic-first GCC decision maker (always for Arabic drafts; for English drafts judges cultural fit)
2. **Gmail-style AI summary** (Gemini): "Summarise this email in 1–2 sentences as an inbox assistant would." Then check: does the summary keep the offer, the reason why now, and the ask? → `offer_survives 0–1`.
3. **Apple-style preview**: one line, max 90 characters. Same survival check.
4. **Spam/deliverability**: deterministic rules (spam trigger words list EN+AR, ALL CAPS, >1 link, image-only, length >150 words, missing opt-out) + a model check → `spam_risk 0–1`.

**Score (0–100):**
```
score = 50 × avg(reply_likelihood over personas)
      + 25 × offer_survives (avg of Gmail + Apple checks)
      + 15 × (1 − spam_risk)
      + 10 × clarity (1 if ≤120 words and one clear ask, else 0.5)
```
Mark the highest-scoring variant as `winner`. If the winner scores < 60, auto-rewrite once using the personas' `what_would_make_me_reply` notes, then simulate again. Show before/after scores.

**Calibration (both methods):**
- Log score vs real reply for every send; a Calibration page shows reply rate by score bucket (0–40, 40–60, 60–80, 80–100) per vertical.
- A/B: for 10% of leads in a campaign, send the second-best variant instead and compare reply rates.

UI: a "Simulated inbox" panel per draft showing the Gmail-style summary card, the Apple-style one-line preview, six persona cards with their verdict and reason, the spam flags, and the 0–100 score. Label everything "Simulated".

---

## Phase 6 — Review & Send dashboard

One page per client: a table of **ready emails**, each row showing thermometer badge, lead (name, title, company), the signal(s) behind it with source links, why_now, winning variant (subject + preview), score. Click a row → side panel with the full email (editable), the other 2 variants, and the simulated-inbox panel.

Buttons: **Approve & Send**, Edit, Swap variant, Skip, Suppress contact.

Sending:
- Connect **Gmail** (OAuth scope `https://www.googleapis.com/auth/gmail.send` only) or **Outlook** (Microsoft Graph `Mail.Send` only). Never request read scopes.
- Enforce `mailboxes.daily_cap` and a random 2–6 minute gap between sends (pg-boss `send` queue with `startAfter`).
- Add `List-Unsubscribe` header and honour "stop" replies by adding to `suppression`.
- Reply detection (v1 without inbox read access): give each send a unique reply-to tracking alias via an inbound email service (e.g. Resend inbound / Postmark inbound) that forwards to the real mailbox and records the reply + AI `reply_class`.

Add a client-facing read-only view (role `client_viewer`) and a white-label weekly report: emails sent, positive replies per 100 sends, meetings, top signals, best plays.

---

## Phase 7 — Billing, compliance, launch

- **Stripe** subscriptions: Agency plan USD 399/month includes 5 client workspaces and 2,500 simulated emails; extra client USD 59/month; usage packs for simulations. Enforce limits.
- **Compliance page + guardrails**: B2B work emails only (block free-mail domains), relevant roles only, signal-based reason in every email, opt-out line, global suppression list, daily caps, consent/legal-basis note per lead, data export and delete per contact.
- Auto-pause a mailbox if bounces > 3% or any spam complaint signal in a day.
- Audit log of who approved each send.
- Landing page (EN/AR) with waitlist + "Book a demo".

---

## Launch checklist (outside Replit)

- [ ] Google OAuth app verification for `gmail.send` (sensitive scope; unverified apps are limited to test users) and Microsoft app registration.
- [ ] Twilio SMS to UAE numbers may require a registered sender ID; check before promising SMS alerts.
- [ ] Lawyer review of UAE PDPL direct-marketing basis and your terms/privacy policy.
- [ ] Replace placeholder signals with the founders' 10–12 signals and weights.
- [ ] Confirm the enrichment provider's terms allow this use.
- [ ] Domain for the app, SPF/DKIM/DMARC for your own alert emails.
