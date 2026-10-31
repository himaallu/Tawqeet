# Hackathon demo — 31 October 2026

The existing agency and first client/Brain are reused. Emails go only to the
demo recipient (`ALERT_EMAIL_TO`, falling back to `OWNER_EMAIL`) — never to a lead.
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

## Review & Send, alerts, billing, compliance

Review & Send lists the winning draft per demo lead. Approve & Send sends through
Resend to the demo recipient only, subject `[Demo · to {lead email or "sample contact"}]`,
with a "Sent from client mailbox (demo)" note, the opt-out line and a
List-Unsubscribe header. Sample contacts carry no email and are shown as
"demo recipient only". Sends are blocked for free-mail domains, suppressed
emails/domains, a missing opt-out line, or more than 30 sends per day.
Mark reply writes a Brain learning; unsubscribe suppresses the contact's domain.

When a lead turns Hot (70+), Tawqeet emails the demo recipient and POSTs
`{company, lead, title, score, temperature, why_now, signals, evidence_url, dashboard_url, channel}`
to `ALERT_WEBHOOK_URL` (Make → Trello card + SMS). Same lead is not re-alerted
within 7 days unless its score rises 15+. Every attempt is in Settings → Alerts.

Digests run in the worker at 08:30 Gulf time: Warm leads every workday (Mon–Fri),
Cold watchlist on Monday. Settings → Alerts → "Send digest now" triggers either.
Marking Bounced / Spam complaint / Unsubscribe on a sent email can auto-pause the
client (>3% bounces or 3+ unsubscribes/complaints today); resume from the banner.
Plan limits: 5 client workspaces and 300 simulated emails per month; beyond that
the UI shows Upgrade. Lead page: Export contact data / Delete contact (anonymised
audit kept, email suppressed; Load demo data will recreate a deleted sample lead).
Reports → choose a client → Share read-only link opens a client-only view.
Reports → A/B test sends the second-best variant for ~10% of approvals.

Demo path: demo login → Settings → Load demo data → Radar → Autobia (Hot) →
Rewrite → Review & Send → Approve & Send → Settings → Alerts → Send test alert →
Billing → Upgrade → Compliance → check `someone@gmail.com` (blocked) → `/welcome` EN/AR.

Run the additive migration with `pnpm --filter @workspace/api-server exec tsx ../../scripts/migrate-demo.ts`.
No test suite was run, per the speed-mode brief.
