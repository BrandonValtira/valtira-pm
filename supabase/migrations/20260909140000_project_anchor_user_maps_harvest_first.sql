-- User maps are Harvest-person first. Jira account IDs are filled in on first worklog (email match).

ALTER TABLE project_anchor_user_maps
  ALTER COLUMN jira_account_id DROP NOT NULL;

DROP INDEX IF EXISTS project_anchor_user_maps_jira_account_id_key;
ALTER TABLE project_anchor_user_maps
  DROP CONSTRAINT IF EXISTS project_anchor_user_maps_jira_account_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pa_user_maps_jira_account
  ON project_anchor_user_maps(jira_account_id)
  WHERE jira_account_id IS NOT NULL;

ALTER TABLE project_anchor_user_maps
  DROP CONSTRAINT IF EXISTS project_anchor_user_maps_harvest_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pa_user_maps_harvest_user_unique
  ON project_anchor_user_maps(harvest_user_id)
  WHERE harvest_user_id IS NOT NULL;
