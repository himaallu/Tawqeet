ALTER TABLE companies ADD COLUMN IF NOT EXISTS radar_meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS demo_key text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sample boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
CREATE UNIQUE INDEX IF NOT EXISTS demo_lead_key ON leads(agency_id,demo_key) WHERE demo_key IS NOT NULL;
