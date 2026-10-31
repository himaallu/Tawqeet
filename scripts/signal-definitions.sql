-- Additive migration; never run automatically on server startup.
ALTER TABLE signal_definitions
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vertical_multipliers jsonb NOT NULL DEFAULT '{"saas":1,"re":1,"hr":1}',
  ADD COLUMN IF NOT EXISTS target_personas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords_en text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords_ar text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclusions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS play_hint text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_negative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'company';
ALTER TABLE signal_definitions DROP CONSTRAINT IF EXISTS signal_source_type_valid;
ALTER TABLE signal_definitions DROP CONSTRAINT IF EXISTS signal_weight_range;
ALTER TABLE signal_definitions ADD CONSTRAINT signal_weight_range CHECK (base_weight BETWEEN -40 AND 40);
ALTER TABLE signal_definitions DROP CONSTRAINT IF EXISTS signal_scope_valid;
ALTER TABLE signal_definitions ADD CONSTRAINT signal_scope_valid CHECK (scope IN ('company','industry'));
ALTER TABLE signals ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS affected_industries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS affected_countries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_quote text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS external_key text;
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signal_company_scope;
ALTER TABLE signals ADD CONSTRAINT signal_company_scope CHECK (
  (scope = 'company' AND company_id IS NOT NULL) OR
  (scope = 'industry' AND company_id IS NULL AND cardinality(affected_industries)>0 AND cardinality(affected_countries)>0)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signals_external_per_agency') THEN
    ALTER TABLE signals ADD CONSTRAINT signals_external_per_agency UNIQUE (agency_id, external_key);
  END IF;
END $$;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_score integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS signal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  url text NOT NULL,
  text text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT signal_snapshot_url UNIQUE(agency_id,url),
  CONSTRAINT signal_snapshots_company_id_agency_id_companies_id_agency_id_fk
    FOREIGN KEY(company_id,agency_id) REFERENCES companies(id,agency_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS signal_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_receipt_per_agency UNIQUE(agency_id,fingerprint)
);
