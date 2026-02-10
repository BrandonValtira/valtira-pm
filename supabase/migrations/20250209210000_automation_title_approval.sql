-- Create report_automations if it doesn't exist (e.g. if earlier migration wasn't run)
CREATE TABLE IF NOT EXISTS report_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month')),
  day_of_week SMALLINT,
  day_of_month SMALLINT,
  time_utc TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  title TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_automations_project ON report_automations(project_id);
ALTER TABLE report_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_automations_all ON report_automations;
CREATE POLICY "report_automations_all" ON report_automations FOR ALL USING (true);

-- Add new columns if table already existed without them (from 20250209200000)
ALTER TABLE report_automations
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN report_automations.title IS 'User-defined label for the automation (e.g. "Weekly client report")';
COMMENT ON COLUMN report_automations.requires_approval IS 'If true, report waits for owner approval before sending to client; if false, sent automatically.';
