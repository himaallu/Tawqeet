# Tawqeet product documentation

Add the PRD and phase build prompts here.

## Phase 0 boundaries

The active product is passwordless login, a single agency, client profiles, client Brain and Settings → System check. Radar, Leads, Review & Send and Plays remain placeholders.

Phase 2 case studies now contain customer name/vertical/country/size, problem, solution, result metric/value, timeframe, quote/title, naming permission, language, source/reference, approval and creation time. Legacy columns remain to avoid discarding existing data during upgrade.

The twelve signal-definition rows are replaceable founder placeholders with the exact supplied weights and half-lives. Demo companies, signals, leads and drafts are fictional offline fixtures only. There is no outbound-sending endpoint.

Shared reference data: `signal_definitions`. Agency-owned data includes companies, signals, plays and every client-related table. Composite foreign keys prevent cross-agency references. Global suppressions use a null agency ID; future suppression checks must explicitly include both the current agency and null global rows.

`client_viewer` access is denied for agency/client APIs until client assignments and review permissions are implemented. No team invitations, client portal or self-service agency signup exists.

The public AI entry is `server/lib/ai.ts`; it forwards into the API package to keep all SDKs and keys server-only. Brain extraction now uses this central AI implementation. Missing pricing results in null cost (unknown), not a fabricated zero.

Brain performs bounded server-side website crawling with private-network protection. OAuth remains a stub. Mailbox-token encryption helpers require ENCRYPTION_KEY. Radar and score-decay schedules are not registered; the worker still handles authentication expiry cleanup and heartbeat only.

## Brain safety boundaries

- Every query and mutation is agency/client scoped and staff-only. Client viewers remain denied.
- AI outputs are untrusted draft evidence. Imported case studies always start `approved=false` and `can_name_customer=false`.
- The future writer must use `server/lib/brain.ts` to receive approved/anonymised evidence and exactly the latest 50 matching client/vertical learnings. It must not read raw website/case-study entries directly.
- Raw profile proof notes are editable context, not case-study approval. The writer boundary excludes these notes so a website claim cannot bypass structured case-study approval.
- Reply learning uses a database trigger, not an API-only hook, so future worker/webhook updates are captured atomically. Install the companion SQL as documented in README when migrating; startup never mutates production schema.
- HubSpot is shared by the agency. Import is deliberate per client, with no background sync and no automatic import on page load. A configured `HUBSPOT_TOKEN` takes precedence over the connected integration.
- Uploaded document bytes go directly into private App Storage using signed URLs. Postgres stores upload ownership and object references, never binary/base64 content.
