ALTER TABLE companies ADD COLUMN IF NOT EXISTS radar_meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS demo_key text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sample boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
CREATE UNIQUE INDEX IF NOT EXISTS demo_lead_key ON leads(agency_id,demo_key) WHERE demo_key IS NOT NULL;
-- Finish-demo additions (additive and idempotent).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS legal_basis text NOT NULL DEFAULT 'B2B legitimate interest';
ALTER TABLE sends ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE sends ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE sends ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE sends ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE sends ADD COLUMN IF NOT EXISTS body text;
CREATE TABLE IF NOT EXISTS alerts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  lead_id uuid,
  channel text NOT NULL,
  status text NOT NULL,
  error text,
  score integer,
  test text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE alerts_log ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE alerts_log ADD COLUMN IF NOT EXISTS test text;
CREATE INDEX IF NOT EXISTS alerts_log_agency_idx ON alerts_log(agency_id, created_at);
CREATE INDEX IF NOT EXISTS alerts_log_lead_idx ON alerts_log(agency_id, lead_id);
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_agency_idx ON audit_log(agency_id, created_at);
