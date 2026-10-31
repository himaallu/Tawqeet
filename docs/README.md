# Tawqeet product documentation

Add the PRD and phase build prompts here.

## Phase 0 boundaries

The active product is passwordless login, a single agency, client profiles and Settings → System check. Radar, Leads, Review & Send, Brain and Plays are navigation placeholders, not implemented features.

The supplied prompt referenced Phase 2 case-study fields without supplying them. `case_studies` currently has tenant/client IDs, title, vertical, challenge, solution, results JSON, content, source URL and creation time. Confirm the final Phase 2 shape before implementing its UI.

The twelve signal-definition rows are replaceable founder placeholders with the exact supplied weights and half-lives. Demo companies, signals, leads and drafts are fictional offline fixtures only. There is no outbound-sending endpoint.

Shared reference data: `signal_definitions`. Agency-owned data includes companies, signals, plays and every client-related table. Composite foreign keys prevent cross-agency references. Global suppressions use a null agency ID; future suppression checks must explicitly include both the current agency and null global rows.

`client_viewer` access is denied for agency/client APIs until client assignments and review permissions are implemented. No team invitations, client portal or self-service agency signup exists.

The public AI entry is `server/lib/ai.ts`; it forwards into the API package to keep all SDKs and keys server-only. No AI call is made in Phase 0. Missing pricing results in null cost (unknown), not a fabricated zero.

No scraping or OAuth flows are implemented. Mailbox-token encryption helpers are ready, but require ENCRYPTION_KEY before use. Radar and score-decay schedules are intentionally not registered. The worker only handles authentication expiry cleanup and heartbeat.
