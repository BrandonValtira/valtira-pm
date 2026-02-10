-- Add Google Drive to user_integrations (for Meet Recordings folder)
ALTER TABLE user_integrations
  DROP CONSTRAINT IF EXISTS user_integrations_provider_check;
ALTER TABLE user_integrations
  ADD CONSTRAINT user_integrations_provider_check
  CHECK (provider IN ('harvest', 'gmail', 'jira', 'google_drive'));
