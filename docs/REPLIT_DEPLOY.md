# Deploying Tawqeet on Replit

## 1. Update the code
1. **Tools → Git → Pull** (branch `main` after merge, or `feat/part3`).
2. In the Shell: `pnpm install`
3. `pnpm run db:migrate`. This runs the Drizzle push, the brain trigger, the signal seed and `scripts/migrate-demo.ts`. Every database change is additive and safe to re-run.

## 2. Secrets (Tools → Secrets)
Only the names are listed here. Never paste values into code or chat. `.env.example` describes each one.

**Required**
- `DATABASE_URL` (Replit provisions it)
- `SESSION_SECRET` (32+ random characters)
- `OWNER_EMAIL`
- `RESEND_FROM_EMAIL`
- `APP_URL` for production (e.g. `https://<app>.replit.app`; development uses `REPLIT_DEV_DOMAIN`)

**AI**
- `AI_PROVIDER`, `AI_MODEL`
- `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
- optional: `DEMO_AI_MODEL`, `GEMINI_SUMMARY_MODEL`, `AI_INPUT_COST_PER_MILLION`, `AI_OUTPUT_COST_PER_MILLION`

**Data**
- `LEADOCEAN_API_KEY`, `HUBSPOT_TOKEN`, `FIRECRAWL_API_KEY`, `SIGNAL_NEWS_FEEDS`, `SIGNAL_TECHNOLOGIES`
- App Storage: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`

**Email**
- `RESEND_API_KEY` (or use the Resend connector)
- `ALERT_EMAIL_TO`
- Reply capture: `INBOUND_WEBHOOK_SECRET`. In Resend, add an inbound webhook (event `email.received`) pointing to `https://<app>.replit.app/api/webhooks/inbound`, and copy its signing secret into this variable.
- Real sending: `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `REAL_SEND`

**Alerts**
- `ALERT_WEBHOOK_URL`
- Trello: `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_LIST_ID`
- Twilio SMS: `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`, `ALERT_SMS_TO`
- Asana: `ASANA_TOKEN`, `ASANA_PROJECT_ID`
- ClickUp: `CLICKUP_TOKEN`, `CLICKUP_LIST_ID`

**Billing**
- `STRIPE_PAYMENT_LINK`

**Landing and demo**
- `BOOK_DEMO_URL`
- `DEMO_MODE=true` (development and demo only)

## 3. Run and verify
1. **Stop**, then **Run**.
2. In the app: sign in, then **Settings → Load demo data**. Wait for "Demo ready".
3. In the Shell: `pnpm run check:env`. It lists missing required variables, then prints PASS / FAIL / SKIP for each configured service. It sends one test email to `ALERT_EMAIL_TO` and one test POST to the webhook.
4. In the Shell: `pnpm run smoke` (needs `DEMO_MODE=true`; set `SMOKE_URL` if the app is not at `APP_URL`). A missing external service shows as SKIP, not FAIL.
5. In the app: **Settings → System checks → Run live checks** shows the same results, without values.

## 4. Publishing
- Use a **Reserved VM** deployment, not Autoscale. The pg-boss worker must run continuously for collectors, hourly decay and the 08:30 Warm/Cold digests (Asia/Dubai). The production start command already supervises the API, the web app and the worker.
- Set `APP_URL` to the published `https://<app>.replit.app` origin.
- Leave `DEMO_MODE` unset (or `false`) on a private production agency.

## 5. OAuth redirect URIs (real mailbox sending)
Register both the development and the published domain. **Settings → Mailboxes** shows the exact URI for the current origin.

| Provider | Where to register | Redirect URIs |
|---|---|---|
| Google (scope `https://www.googleapis.com/auth/gmail.send` only) | Google Cloud → APIs & Services → Credentials → OAuth client (Web) | `https://<your-repl>.replit.dev/api/mailboxes/oauth/gmail/callback`<br>`https://<app>.replit.app/api/mailboxes/oauth/gmail/callback` |
| Microsoft (`Mail.Send` + `offline_access`) | Entra ID → App registrations → Authentication (Web) | `https://<your-repl>.replit.dev/api/mailboxes/oauth/outlook/callback`<br>`https://<app>.replit.app/api/mailboxes/oauth/outlook/callback` |

After connecting a mailbox, `REAL_SEND=true` sends approved emails to the actual lead through it. Human approval, compliance checks and the daily cap of 30 still apply. Without `REAL_SEND`, everything goes to the demo recipient via Resend.
