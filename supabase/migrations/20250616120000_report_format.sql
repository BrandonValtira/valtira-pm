-- Report format: standard (existing) or budget_allocation (Jira % breakdown + per-project tables)
ALTER TABLE report_automations
  ADD COLUMN IF NOT EXISTS report_format TEXT NOT NULL DEFAULT 'standard'
  CHECK (report_format IN ('standard', 'budget_allocation'));

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS report_format TEXT NOT NULL DEFAULT 'standard'
  CHECK (report_format IN ('standard', 'budget_allocation'));

COMMENT ON COLUMN report_automations.report_format IS 'standard = time/budget table; budget_allocation = % split across linked Jira projects';
COMMENT ON COLUMN reports.report_format IS 'standard = time/budget table; budget_allocation = % split across linked Jira projects';
