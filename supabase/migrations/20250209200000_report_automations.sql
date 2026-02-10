-- Report automations: one or many per project (e.g. weekly + monthly)
CREATE TABLE IF NOT EXISTS report_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month')),
  day_of_week SMALLINT,       -- 0=Sun, 1=Mon, ... 6=Sat (for weekly)
  day_of_month SMALLINT,      -- 1-28 (for monthly, avoid month-end)
  time_utc TEXT NOT NULL,     -- e.g. "14:00"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_automations_project ON report_automations(project_id);
ALTER TABLE report_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_automations_all" ON report_automations FOR ALL USING (true);
