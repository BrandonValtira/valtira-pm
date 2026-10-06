-- One active super admin whose connected Harvest, Google, and Jira accounts
-- supply company-wide data (projects, reports, PTO, Jira sync).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_connection boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_one_org_connection
  ON users (org_connection)
  WHERE org_connection;
