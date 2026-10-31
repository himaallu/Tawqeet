# Tawqeet feature audit

Status as of Part 3 (`feat/part3`). The full PRD is not in this repository (`docs/` has only the signal definitions and the demo notes), so this audit covers the README phases and the build prompts for the hackathon, Part 2 and Part 3.
Done = built and verified locally · Partial = built with a stated gap · Not built.

API routes are in `artifacts/api-server/src/routes`, server libraries in `artifacts/api-server/src/lib`, pages in `artifacts/tawqeet/src/pages`, and the schema in `lib/db/src/schema`.

## Foundation (Phase 0)
| Feature | Status | Files |
|---|---|---|
| pnpm workspace, React/Vite web app, Express API, Drizzle DB, OpenAPI codegen | Done | `artifacts/*`, `lib/*` |
| Magic-link login (Resend), sessions, single agency, roles | Done | `routes/auth.ts`, `lib/security.ts` |
| Clients CRUD | Done | `routes/clients.ts`, `pages/clients.tsx` |
| System checks (presence + live service checks) | Done | `routes/system.ts`, `lib/service-checks.ts`, `components/live-checks.tsx` |
| pg-boss worker with heartbeat | Done | `lib/worker-runtime.ts`, `worker/index.ts` |

## Signals and leads (Phases 1 and 3)
| Feature | Status | Files |
|---|---|---|
| 20 signal definitions, settings editor, decay and caps | Done | `lib/signals/*`, `pages/signals.tsx` |
| Radar: ATS hiring, RSS, page diffs, manual URL signal | Done | `lib/signals/collectors.ts`, `lib/demo/hiring.ts`, `pages/radar.tsx` |
| Lead temperature scoring with evidence and stacking | Done | `lib/signals/scoring.ts` |
| LeadOcean enrichment | Partial: demo leads only; real contacts have no email | `lib/demo/seed.ts` |
| Legal basis per lead | Done | `leads.legal_basis`, `pages/demo-lead.tsx` |

## Brain (Phase 2)
| Feature | Status | Files |
|---|---|---|
| Client profile, website crawl, case studies, uploads | Done | `routes/brain.ts`, `lib/brain/*` |
| CSV and HubSpot import | Done (client OAuth deferred) | `lib/brain/crm.ts` |
| Reply → learning trigger (last 50 learnings fed to the writer) | Done | `scripts/brain-learning.sql`, `lib/brain/writer-context.ts` |

## Writing, simulation and plays (Phases 4 and 5)
| Feature | Status | Files |
|---|---|---|
| 3 grounded variants, EN/AR, opt-out appended | Done | `lib/demo/writer.ts` |
| Six-persona simulated inbox, Gmail summary (Gemini), Apple preview, spam check | Done | `lib/demo/writer.ts`, `components/demo-bits.tsx` |
| Rewrite and re-score | Done | `routes/demo.ts` |
| Plays library (per signal, EN/AR) | Partial: editable page only; plays are not yet fed to the writer prompt | `pages/plays.tsx`, `routes/operations.ts` |

## Sending (Phase 6)
| Feature | Status | Files |
|---|---|---|
| Review & Send with editable winner, variants and approval record | Done | `routes/review.ts`, `pages/review.tsx` |
| Demo sending via Resend to the demo recipient only | Done | `lib/resend.ts` |
| Compliance: free-mail block, suppression, opt-out, daily cap 30, human approval | Done | `lib/compliance.ts`, `pages/compliance.tsx` |
| Auto-pause (>3% bounces or 3+ unsubscribes/complaints a day) | Done (bounces/complaints are marked manually) | `lib/compliance.ts` |
| Gmail (gmail.send) and Outlook (Mail.Send) OAuth with encrypted tokens | Partial: built, not tested against live Google/Microsoft accounts | `lib/mailbox.ts`, `routes/mailboxes.ts`, `pages/mailboxes.tsx` |
| REAL_SEND=true sends to the actual lead through the connected mailbox | Partial: as above; Outlook can't set a real List-Unsubscribe header through Graph | `routes/review.ts` |
| Manual reply marking → Brain learning, unsubscribe → suppression | Done | `routes/review.ts` |
| Inbound reply capture (Resend inbound webhook + AI classification) | Not built | — |
| A/B test (10% of approvals send the second-best variant) | Done | `routes/review.ts`, `pages/reports.tsx` |

## Alerts, billing, operations (Phase 7)
| Feature | Status | Files |
|---|---|---|
| Hot-lead alerts: email + Make webhook, 7-day dedupe, log | Done | `lib/alerts.ts`, `pages/alerts.tsx` |
| Direct Trello, Twilio SMS, Asana, ClickUp (only when their env vars are set) | Partial: built, not tested against live accounts | `lib/integrations.ts` |
| Warm digest (Mon–Fri 08:30) and Cold weekly (Mon 08:30), Send now | Done | `lib/digests.ts`, `lib/worker-runtime.ts` |
| Billing page, usage, Stripe Payment Link | Done | `pages/billing.tsx` |
| Plan limits (5 clients, 300 simulations a month) with an Upgrade prompt | Done | `lib/plan.ts` |
| Stripe Checkout via the API (STRIPE_SECRET_KEY, STRIPE_PRICE_AGENCY) | Not built (the Payment Link stays) | — |
| Audit log | Done | `audit_log`, `pages/compliance.tsx` |
| Contact export and delete (anonymised audit, suppression) | Done | `routes/operations.ts`, `components/contact-rights.tsx` |
| Client report, calibration, read-only share link (client_viewer) | Done | `pages/reports.tsx`, `pages/share.tsx`, `components/viewer-shell.tsx` |
| Landing page `/welcome` EN/AR | Done | `pages/landing.tsx` |

## Tooling
| Feature | Status | Files |
|---|---|---|
| `.env.example` grouped, required/optional | Done | `.env.example` |
| `pnpm run check:env` (missing vars + live PASS/FAIL/SKIP) | Done | `scripts/check-env.ts` |
| `pnpm run smoke` (demo path end to end) | Done | `scripts/smoke.ts` |
| Replit deployment guide | Done | `docs/REPLIT_DEPLOY.md` |
