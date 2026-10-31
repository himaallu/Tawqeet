# Tawqeet · توقيت

Tawqeet is a multi-tenant SaaS for B2B outbound agencies in the UAE and GCC. It watches Gulf business signals, finds the right lead, scores how "hot" the lead is, writes three email variants, tests them on a simulated AI inbox, and lets the agency's client review and send from their own mailbox. **No email is ever sent without a human clicking Send.**

## Stack

- React + Vite front end, Express + TypeScript API, one project (Tailwind v4, shadcn-style components on Radix)
- Postgres with Drizzle ORM (migrations in `drizzle/`)
- Email magic-link auth, sessions in Postgres (no passwords). Mail goes through Replit's Resend connection, or `RESEND_API_KEY`
- Background jobs: pg-boss in the same Postgres. Two processes: `web` (`server/index.ts`) and `worker` (`worker/index.ts`). Deploy on a Replit **Reserved VM**
- All AI through `server/lib/ai.ts` (Vercel AI SDK `generateObject` + zod), provider picked by `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`; every call logged to `ai_usage` with tokens and cost
- Web pages: `fetch` + cheerio, Firecrawl fallback for JavaScript pages (`server/lib/scrape.ts`), robots.txt respected
- People data: LeadOcean behind `server/lib/enrichment.ts`
- Arabic: `dir="auto"` on every email body; Arabic plays written natively in MSA

## Run locally

```bash
npm install
cp .env.example .env          # set DATABASE_URL and ENCRYPTION_KEY at minimum
npm run db:migrate
npm run db:seed               # demo agency, 2 clients, 10 Gulf signals, leads, drafts, past sends
npm run dev                   # web on http://localhost:5000 (set PORT=5050 on macOS: AirPlay uses 5000)
npm run worker                # background jobs, in a second terminal
```

Sign in as `demo@tawqeet.demo` (owner), `member@tawqeet.demo`, or `viewer@tawqeet.demo` (read-only client viewer). Without Resend configured, the magic link prints in the `npm run dev` log. Without an AI key, the app runs in **offline demo mode**: drafts, classification and the simulated inbox use built-in deterministic logic, and Settings › System check shows AI as red.

Other scripts: `npm run build`, `npm start` (web + worker together, production), `npm run db:generate` (after editing `server/db/schema.ts`), `npm run lint`, `npm run typecheck`, `npm test` (needs Postgres; uses a separate `tawqeet_test` database).

Generate an encryption key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

### Deploying on Replit (Reserved VM)

Build command `npm run build`; run command `npm run db:migrate && npm start`. Set `NODE_ENV=production`, `APP_URL` to the public URL, and the secrets below. Settings › System check shows what's missing.

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `APP_URL` | Public URL, used in magic links, OAuth redirects and alerts |
| `PORT` | Web port (default 5000) |
| `ENCRYPTION_KEY` | 32-byte base64 key; encrypts mailbox OAuth tokens and PM API tokens at rest |
| `ADMIN_EMAILS` | Comma-separated platform admins (edit signal weights, radar sources, run jobs) |
| `RESEND_API_KEY` | Resend key, if not using Replit's Resend connection |
| `EMAIL_FROM` | From address for system emails |
| `INBOUND_DOMAIN` | Domain for per-send reply-tracking aliases (`r+token@…`) |
| `INBOUND_WEBHOOK_SECRET` | Shared secret for `POST /api/inbound` (Resend/Postmark inbound) |
| `AI_PROVIDER` | Optional: `gemini`, `anthropic` or `openai` |
| `AI_MODEL` | Optional: override the default model |
| `AI_OFFLINE` | `1` forces offline demo logic (seed, tests) |
| `GEMINI_API_KEY` | Google Gemini key (also used for the Gmail-style summary check) |
| `ANTHROPIC_API_KEY` | Anthropic key |
| `OPENAI_API_KEY` | OpenAI key |
| `LEADOCEAN_API_KEY` | LeadOcean people/company data |
| `FIRECRAWL_API_KEY` | Hosted scraper for JavaScript pages |
| `GOOGLE_CLIENT_ID` | Gmail OAuth (send-only) |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth (send-only) |
| `MICROSOFT_CLIENT_ID` | Outlook OAuth (send-only) |
| `MICROSOFT_CLIENT_SECRET` | Outlook OAuth (send-only) |
| `TWILIO_SID` | Twilio account SID for SMS alerts |
| `TWILIO_TOKEN` | Twilio auth token |
| `TWILIO_FROM` | Twilio sender number / ID |
| `HUBSPOT_CLIENT_ID` | HubSpot OAuth for the CRM import |
| `HUBSPOT_CLIENT_SECRET` | HubSpot OAuth for the CRM import |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`POST /api/stripe/webhook`) |
| `STRIPE_PRICE_AGENCY` | Price ID, Agency plan USD 399/month |
| `STRIPE_PRICE_EXTRA_CLIENT` | Price ID, extra client USD 59/month |
| `STRIPE_PRICE_SIM_PACK` | Price ID, simulation pack (one-time) |
| `BOOK_DEMO_URL` | Optional calendar link for "Book a demo" (otherwise it joins the waitlist) |

## Build status

- [x] Phase 0: Context, project setup, scripts, docs
- [x] Phase 1: Data model, auth, workspaces
- [x] Phase 2: The Brain (crawl, form, CRM, case studies, learnings)
- [x] Phase 3: Signal radar, thermometer, hot-lead alerts
- [x] Phase 4: Writer (3 variants, plays, hard rules)
- [x] Phase 5: Simulated inbox (6 personas, summaries, spam, score, calibration)
- [x] Phase 6: Review & Send (Gmail/Outlook send-only, queue, replies, viewer, reports)
- [x] Phase 7: Billing, compliance, landing page

Build prompts and the PRD live in `docs/`.
