# Tawqeet

Tawqeet is a B2B outbound agency workspace for the UAE/GCC. Only the foundation is active: Resend magic-link login, Postgres sessions, one agency, clients and Settings → System check.

## Scope and decisions

- The user explicitly replaced Next.js with React/Vite + Express/TypeScript.
- Keep Postgres/Drizzle, pg-boss as a separate process, Tailwind/shadcn and server-only API keys. No passwords or Replit Auth.
- Never add outbound, radar, AI, scraping or portal features before the user requests the relevant phase.
- Client data requires an agency ID and tenant-filtered queries. Derive tenancy from the session. Composite foreign keys also prevent cross-agency relationships.
- Initial owner claims require the configured owner email and a real one-time email verification. No demo login/auth bypass.
- Client viewers are intentionally denied agency data until client assignments exist.
- No email is sent without a human action. No outbound-send endpoint exists this phase.
- The Phase 2 case-study prompt was missing; the minimal schema is provisional, documented in `docs/README.md`.

## Commands

- Managed frontend: `artifacts/tawqeet: web`
- Managed API: `artifacts/api-server: API Server`
- Separate process: `Tawqeet Worker` / `pnpm run worker`
- Static validation: `pnpm run typecheck`
- Full build: `pnpm run build`
- Development schema only: `pnpm run db:migrate`
- Idempotent fixtures: `pnpm run db:seed`

## Source map

- API contract: `lib/api-spec/openapi.yaml`; run `pnpm --filter @workspace/api-spec run codegen` after changes.
- Schema: `lib/db/src/schema/`.
- API: `artifacts/api-server/src/routes/`; server utilities in its `src/lib/`.
- Frontend: `artifacts/tawqeet/src/`.
- Public server-only AI entry: `server/lib/ai.ts`.
- Worker entry: `worker/index.ts`.
- Seed entry: `seed.ts`.

## Operations

Secrets stay in environment settings. Diagnostics expose booleans/explanations only. Resend uses the connected integration, not a raw API-key variable. A sending-only Resend key returns `restricted_api_key` for domain-list requests; that is a valid connection, not an expired credential.

Use Reserved VM when publishing. API production supervision starts the compiled API and worker as separate Node processes. No radar/score-decay jobs are scheduled yet. Replit Publish manages production schema; never apply development migration commands or auto-seed on production startup.

After each completed phase, update `CHANGELOG.md`, tick README's phase checklist, and finish with `Ready to commit: <suggested commit message>`. Do not commit or push on the user's behalf.
