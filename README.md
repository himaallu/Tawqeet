# Tawqeet

Tawqeet is a multi-tenant B2B outbound workspace for agencies in the UAE and GCC. It is being built in phases. **Only the foundation is enabled:** passwordless sign-in, one agency, client profiles and Settings → System check.

Radar, Leads, Review & Send, Brain and Plays are labelled “Soon”. No outbound email, scraping, enrichment, scoring, AI generation or mailbox connection is enabled.

## Stack

- React + Vite, TypeScript, Tailwind CSS, shadcn/ui
- Express + TypeScript API in the same project
- PostgreSQL with Drizzle ORM
- Resend magic-link emails through the connected integration
- Hashed, single-use magic links and PostgreSQL-backed sessions; no passwords
- pg-boss in a separate `worker/index.ts` process, using the same PostgreSQL
- Vercel AI SDK server-only entry point at `server/lib/ai.ts` (not called this phase)
- Arabic text support using `dir="auto"`

This uses the approved React/Vite + Express stack instead of the original Next.js specification. It does not use Replit Auth or local passwords.

## Run in Replit

The managed web and API workflows run the preview. The **Tawqeet Worker** workflow runs the separate worker. The shared preview gateway routes `/api` to Express and `/` to Vite.

Development schema and offline fixtures:

```sh
pnpm run db:migrate
pnpm run db:seed
```

Seed is idempotent and does not overwrite edited client profiles. It creates one agency, two demo clients, twelve placeholder signal definitions, ten fictional Gulf signals, two demo leads and six draft fixtures. All fixture domains use `.example`; no emails are sent. **Offline fixtures do not bypass login.** The owner account is created only after verifying the first magic link sent to the configured owner address.

## Run locally

Node.js 24 and pnpm 10 are required. This repository is a pnpm workspace: use `pnpm install`, not `npm install` (the latter is intentionally rejected to avoid conflicting lockfiles).

1. Install dependencies:

   ```sh
   corepack enable
   pnpm install
   ```

2. Supply the environment variables below through your shell or secret manager. `.env.example` lists names only and has no credentials. No script writes credentials to disk.
3. Use a local PostgreSQL database; run `pnpm run db:migrate` and `pnpm run db:seed`.
4. Set `APP_URL` to the local browser origin, then run:

   ```sh
   npm run dev
   ```

   Open the URL printed by the development gateway. Vite and Express run behind a single-origin local gateway. Start the separate worker in another terminal:

   ```sh
   npm run worker
   ```

5. A Resend connection is supplied by Replit's connector runtime. A plain local environment without that runtime cannot send sign-in emails; use the Replit preview for live login. There is no offline or development auth bypass.

`npm run` can invoke scripts, but dependency installation and workspace operations use pnpm.

### Scripts

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Local Vite + Express development gateway |
| `pnpm run worker` | Separate pg-boss worker |
| `pnpm run build` | Typecheck, build frontend, compile API and worker |
| `pnpm run start` | Serve built frontend + API and run the compiled worker as separate processes |
| `pnpm run db:migrate` | Apply Drizzle schema changes to **development/local** database |
| `pnpm run db:seed` | Idempotent offline demonstration fixtures |
| `pnpm run lint` | TypeScript static validation across the project |

`lint` is currently a typecheck, not an ESLint rule suite.

## Environment variables

Names only are listed below; values belong in Secrets or environment settings, never source control or client-side variables.

### Required for this foundation

- `DATABASE_URL` — PostgreSQL connection, managed by Replit.
- `SESSION_SECRET` — random server secret with at least 32 characters for token hashing.
- `APP_URL` — trusted HTTPS browser origin; the development preview origin is used only in development when this is omitted.
- `OWNER_EMAIL` — sole address allowed to claim the initial owner account.
- `RESEND_FROM_EMAIL` — sender address on a verified Resend domain; Resend's test sender has recipient restrictions.

Resend credentials are managed by the connected integration. No `RESEND_API_KEY` is required or exposed to the browser.

### Reserved for later phases

- `ENCRYPTION_KEY` — 64 hexadecimal characters for AES-256-GCM encryption of OAuth tokens.
- `GEMINI_API_KEY` — optional Gemini provider credential.
- `ANTHROPIC_API_KEY` — optional Anthropic provider credential.
- `OPENAI_API_KEY` — optional OpenAI provider credential.
- `AI_PROVIDER` — provider selection for the central server-only AI module.
- `AI_MODEL` — explicit model selection before any AI request.
- `AI_INPUT_COST_PER_MILLION` — input-token pricing for the selected model.
- `AI_OUTPUT_COST_PER_MILLION` — output-token pricing for the selected model.
- `FIRECRAWL_API_KEY` — hosted JavaScript scraping fallback, not used this phase.
- `GOOGLE_CLIENT_ID` — future Gmail OAuth application identifier.
- `GOOGLE_CLIENT_SECRET` — future Gmail OAuth application secret.
- `MICROSOFT_CLIENT_ID` — future Outlook OAuth application identifier.
- `MICROSOFT_CLIENT_SECRET` — future Outlook OAuth application secret.
- `STRIPE_SECRET_KEY` — future billing credential.
- `STRIPE_WEBHOOK_SECRET` — future billing webhook verification secret.

### Runtime

- `NODE_ENV` — development or production mode.
- `PORT` — service listening port, injected by managed workflows.
- `BASE_PATH` — frontend mount prefix, injected by the web artifact.
- `API_PORT` — optional local development API port.
- `WEB_PORT` — optional local development Vite port.
- `SERVE_WEB` — enable serving built frontend assets from Express in standalone production mode.

## Security and tenancy

- Client data is agency-scoped at both query and foreign-key boundaries. Agency IDs are derived from the authenticated session, never trusted from input.
- Roles are `owner`, `member`, and `client_viewer`. Owners manage agency settings, clients and diagnostics. Members can manage client profiles, but cannot delete them. Client viewers are denied agency data until explicit assignments are built.
- Magic links expire in 15 minutes and are consumed atomically only on an explicit confirmation click. Tokens are never returned by API endpoints or stored in plaintext.
- Sessions expire after seven days and use HttpOnly, SameSite cookies with Secure enabled on HTTPS. Signing out removes the database session.
- Mutation endpoints enforce the trusted browser origin. Request bodies, cookie values and magic-link tokens are not logged.
- Missing optional secrets appear red in System check but do not block the foundation. Presence checks do not pretend to validate provider credentials.
- No email is sent automatically by seed or worker. Sign-in mail is sent only after a person submits the login form. No outbound-send API exists.

## Publishing later

Use a **Reserved VM**, not Autoscale, so the pg-boss worker stays running. Select that deployment type in Publishing. The API's production command supervises the compiled web/API and worker as separate Node processes; the frontend artifact serves its static build.

Before publishing, set `APP_URL` for the actual published origin and use a verified Resend sender for multi-user delivery. Do not use a development preview URL in production. Replit's Publish flow manages production schema changes; never run `db:migrate` against the managed production database, and do not run migrations or seed automatically during startup.

Schedules for radar every 30 minutes and nightly score decay are deliberately deferred. Only hourly authentication cleanup is scheduled now.

## Build status

- [x] Phase 0 — Project setup, all foundation tables, Resend magic links, sessions, one agency, clients, system diagnostics and worker foundation
- [ ] Phase 1 — Radar and business-signal collection
- [ ] Phase 2 — Brain, client learning and case studies
- [ ] Phase 3 — Leads, enrichment and temperature scoring
- [ ] Phase 4 — Plays and three email variants
- [ ] Phase 5 — AI inbox simulations and review
- [ ] Phase 6 — Human-approved mailbox sending and reply handling
- [ ] Phase 7 — Alerts, billing and operational hardening

Phase names after 0 are provisional summaries; add the definitive build prompts and PRD under `docs/`.

## Current limits

- No real sign-in email has been sent as an automated test. The test sender can only reach recipients allowed by the connected Resend account.
- Signed-in screens require a real magic-link session; no authentication bypass is supplied.
- The Phase 2 case-study field specification was not attached. The minimal schema and the open question are documented in `docs/README.md`.
- Future features have tables and demo fixtures only, not APIs or working screens.
- Automated auth/tenant regression tests are not part of this first-build delivery.
