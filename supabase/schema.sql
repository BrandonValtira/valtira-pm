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
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'biweek', 'month')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'rejected')),
  harvest_data_snapshot JSONB,
  report_format TEXT NOT NULL DEFAULT 'standard' CHECK (report_format IN ('standard', 'budget_allocation')),
  report_config JSONB NOT NULL DEFAULT '{}'::jsonb,
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
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'biweek', 'month')),
  day_of_week SMALLINT,
  day_of_month SMALLINT,
  time_utc TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  report_format TEXT NOT NULL DEFAULT 'standard' CHECK (report_format IN ('standard', 'budget_allocation')),
  report_config JSONB NOT NULL DEFAULT '{}'::jsonb,
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
  jira_project_keys TEXT[] NOT NULL DEFAULT '{}',
  contract_expiry_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE resource_planning_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_planning_projects_all" ON resource_planning_projects FOR ALL USING (true);

-- SOW PDFs per resource planning project
CREATE TABLE IF NOT EXISTS resource_planning_project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'sow' CHECK (file_type IN ('sow', 'pdf_note', 'meet_recording')),
  metadata JSONB NOT NULL DEFAULT '{}',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rp_project_files_project ON resource_planning_project_files(project_name);
ALTER TABLE resource_planning_project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_planning_project_files_all" ON resource_planning_project_files FOR ALL USING (true);

-- Project Anchor: Jira worklog \u2192 Harvest time entry sync
CREATE TABLE IF NOT EXISTS project_anchor_user_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jira_account_id TEXT UNIQUE,
  jira_email TEXT,
  jira_display_name TEXT,
  harvest_user_id BIGINT,
  harvest_email TEXT,
  harvest_display_name TEXT,
  default_harvest_task_name TEXT,
  mapped_by TEXT NOT NULL DEFAULT 'email_auto' CHECK (mapped_by IN ('email_auto', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_user_maps_harvest_user ON project_anchor_user_maps(harvest_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pa_user_maps_harvest_user_unique ON project_anchor_user_maps(harvest_user_id) WHERE harvest_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pa_user_maps_jira_account ON project_anchor_user_maps(jira_account_id) WHERE jira_account_id IS NOT NULL;
ALTER TABLE project_anchor_user_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_anchor_user_maps_all" ON project_anchor_user_maps FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS project_anchor_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jira_issue_id TEXT NOT NULL,
  jira_issue_key TEXT NOT NULL,
  jira_issue_summary TEXT,
  jira_worklog_id TEXT NOT NULL UNIQUE,
  jira_account_id TEXT NOT NULL,
  harvest_user_id BIGINT,
  harvest_project_id BIGINT,
  harvest_project_code TEXT,
  harvest_project_name TEXT,
  harvest_task_id BIGINT,
  harvest_task_name TEXT,
  harvest_time_entry_id BIGINT,
  harvest_link_source TEXT CHECK (harvest_link_source IS NULL OR harvest_link_source IN ('created', 'adopted')),
  duplicate_harvest_time_entry_id BIGINT,
  hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  spent_date DATE NOT NULL,
  notes TEXT,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'failed', 'ignored', 'deleted', 'duplicate')),
  last_synced_at TIMESTAMPTZ,
  last_retry_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_entries_spent_date ON project_anchor_entries(spent_date);
CREATE INDEX IF NOT EXISTS idx_pa_entries_sync_status ON project_anchor_entries(sync_status);
CREATE INDEX IF NOT EXISTS idx_pa_entries_jira_account ON project_anchor_entries(jira_account_id);
CREATE INDEX IF NOT EXISTS idx_pa_entries_updated_at ON project_anchor_entries(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pa_entries_harvest_time_entry
  ON project_anchor_entries(harvest_time_entry_id)
  WHERE harvest_time_entry_id IS NOT NULL;
ALTER TABLE project_anchor_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_anchor_entries_all" ON project_anchor_entries FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS project_anchor_sync_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  last_webhook_at TIMESTAMPTZ,
  last_successful_harvest_at TIMESTAMPTZ,
  last_successful_jira_at TIMESTAMPTZ,
  last_reconcile_at TIMESTAMPTZ,
  last_jira_error TEXT,
  last_harvest_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO project_anchor_sync_state (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
ALTER TABLE project_anchor_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_anchor_sync_state_all" ON project_anchor_sync_state FOR ALL USING (true);
