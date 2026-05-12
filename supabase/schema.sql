-- Valtira PM: Postgres schema for Supabase
-- Run this in Supabase SQL Editor after creating a project

-- App users (synced from NextAuth; we add role and invite flow)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'pm' CHECK (role IN ('super_admin', 'pm')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  invited_at TIMESTAMPTZ,
  invited_by_user_id UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Invites (token-based invite links; super_admin can revoke or resend)
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pm',
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);

-- Per-user integrations: Harvest (token), Gmail (OAuth), Jira (API token)
CREATE TABLE IF NOT EXISTS user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('harvest', 'gmail', 'jira')),
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  provider_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON user_integrations(user_id);

-- Projects (owned by a PM; linked to Harvest project IDs)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  harvest_project_ids BIGINT[] NOT NULL DEFAULT '{}',
  client_emails TEXT[] NOT NULL DEFAULT '{}',
  auto_schedule TEXT NOT NULL DEFAULT 'off' CHECK (auto_schedule IN ('off', 'weekly', 'monthly')),
  day_of_week SMALLINT,
  time_utc TEXT,
  contract_expiry_date DATE,
  jira_project_keys TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);

-- Reports (one per project per period)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'rejected')),
  harvest_data_snapshot JSONB,
  pdf_storage_path TEXT,
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES users(id),
  sent_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  approval_requested_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- History of sent reports (for audit)
CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_emails TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_report_history_report ON report_history(report_id);

-- Report automations: one or many per project (e.g. weekly + monthly)
CREATE TABLE IF NOT EXISTS report_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month')),
  day_of_week SMALLINT,
  day_of_month SMALLINT,
  time_utc TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_automations_project ON report_automations(project_id);

-- Uploaded files (transcripts, PDF notes) per project
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('transcript', 'pdf_note')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);

-- Row Level Security: enabled but permissive for now (API uses service role which bypasses RLS).
-- Tighten later if you use Supabase client from the browser with anon key.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_all" ON users FOR ALL USING (true);
CREATE POLICY "user_integrations_all" ON user_integrations FOR ALL USING (true);
CREATE POLICY "projects_all" ON projects FOR ALL USING (true);
CREATE POLICY "reports_all" ON reports FOR ALL USING (true);
CREATE POLICY "report_history_all" ON report_history FOR ALL USING (true);
CREATE POLICY "report_automations_all" ON report_automations FOR ALL USING (true);
CREATE POLICY "project_files_all" ON project_files FOR ALL USING (true);
CREATE POLICY "invites_all" ON invites FOR ALL USING (true);

-- Resource planning: allocations per (resource name, role, project, week)
CREATE TABLE IF NOT EXISTS resource_planning_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_name TEXT NOT NULL,
  role TEXT NOT NULL,
  project_name TEXT NOT NULL,
  week_start DATE NOT NULL,
  fte DECIMAL(5,4) NOT NULL DEFAULT 0 CHECK (fte >= 0 AND fte <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(resource_name, role, project_name, week_start)
);
CREATE INDEX IF NOT EXISTS idx_rp_allocations_resource_week ON resource_planning_allocations(resource_name, week_start);
CREATE INDEX IF NOT EXISTS idx_rp_allocations_week ON resource_planning_allocations(week_start);
ALTER TABLE resource_planning_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_planning_allocations_all" ON resource_planning_allocations FOR ALL USING (true);

-- Project metadata: display title and Harvest associations
CREATE TABLE IF NOT EXISTS resource_planning_projects (
  project_name TEXT PRIMARY KEY,
  display_title TEXT,
  harvest_project_ids INTEGER[] NOT NULL DEFAULT '{}',
  harvest_project_names TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE resource_planning_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_planning_projects_all" ON resource_planning_projects FOR ALL USING (true);
