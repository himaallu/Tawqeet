# Changelog

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
