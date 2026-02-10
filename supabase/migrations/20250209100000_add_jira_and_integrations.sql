-- Add Jira to user_integrations and jira_project_keys to projects

ALTER TABLE user_integrations
  DROP CONSTRAINT IF EXISTS user_integrations_provider_check;

ALTER TABLE user_integrations
  ADD CONSTRAINT user_integrations_provider_check
  CHECK (provider IN ('harvest', 'gmail', 'jira'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS jira_project_keys TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN projects.jira_project_keys IS 'Jira project keys (e.g. PROJ, DEV) for context/knowledge';
