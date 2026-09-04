-- One configurable report: optional components + bi-weekly cadence.

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_period_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_period_type_check
  CHECK (period_type IN ('week', 'biweek', 'month'));

ALTER TABLE report_automations DROP CONSTRAINT IF EXISTS report_automations_period_type_check;
ALTER TABLE report_automations ADD CONSTRAINT report_automations_period_type_check
  CHECK (period_type IN ('week', 'biweek', 'month'));

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS report_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE report_automations
  ADD COLUMN IF NOT EXISTS report_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN reports.report_config IS 'Optional report components, additional info text, and footer';
COMMENT ON COLUMN report_automations.report_config IS 'Optional report components used when the automation runs';
