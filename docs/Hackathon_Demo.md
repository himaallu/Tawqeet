# Hackathon demo — 31 October 2026

The existing agency and first client/Brain are reused. No emails are sent.
Enable `DEMO_MODE=true` explicitly. It is enabled only in the development
environment; do not enable it on a private production agency. The public demo
sign-in creates a four-hour member session. Turning demo mode off invalidates
that user's access, including previously issued cookies.

Settings → Load demo data loads eight companies and two contacts each. Source
headlines and short quotations were read from the supplied pages. Two Marketing
Monk URLs returned404; MEVP and Naukrigulf alternatives provide actual job evidence.
Wamda source dates available only to month precision use the month's last day
as a conservative scoring bound, not an asserted exact publication date.
Ziina's company-specific licence approval is restricted to Ziina; it is not
an industry-wide regulation signal.

LeadOcean is attempted when its server key and company domain are available.
Fallback contacts are marked sample, have no invented email address and cannot
be sent messages. Demo fit inputs are illustrative, not verified enrichment.
Stacking adds5 per additional distinct positive signal type, capped at10,
inside the existing50-point signal cap. Total remains0–100.

If fewer than two approved cases exist, illustrative approved demo workflows
are added. These are explicitly labeled and excluded from writer proof.
Three drafts and six-persona simulations are precomputed for each demo lead.
The writer consumes approved matching case studies and recent Brain learnings;
Ghanem uses Arabic. Numeric claims must occur in context. Opt-out is appended.

Anthropic Haiku handles inexpensive writer/persona calls. With GEMINI_API_KEY,
Gemini generates the Gmail-style summary; without it the actual alternate model
is labeled. API failure yields an explicitly heuristic inbox assessment, never
a fabricated Gemini response. No provider inbox or actual deliverability is tested.

Run radar now tries cached ATS then Greenhouse, Lever, Ashby and Workable slugs,
then public careers links. Baselines without publication dates do not count as
new roles for hiring surge. RSS failures retain existing evidence and show warnings.
Jobs run in-process for this time-boxed single-instance demo; a restart interrupts
in-flight work. Load demo data again resumes missing drafts.

Run the additive migration with `pnpm --filter @workspace/api-server exec tsx ../../scripts/migrate-demo.ts`.
No test suite was run, per the speed-mode brief.
