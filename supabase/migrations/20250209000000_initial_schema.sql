-- Valtira PM: initial schema

-- App users (synced from NextAuth; we add role and invite flow)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'pm' CHECK (role IN ('super_admin', 'pm')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active')),
  invited_at TIMESTAMPTZ,
  invited_by_user_id UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- Invites (optional; for token-based invite links)
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pm',
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_email ON invites(email);

-- Per-user OAuth tokens for Harvest and Gmail
CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('harvest', 'gmail')),
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  provider_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_user_integrations_user_id ON user_integrations(user_id);

-- Projects (owned by a PM; linked to Harvest project IDs)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  harvest_project_ids BIGINT[] NOT NULL DEFAULT '{}',
  client_emails TEXT[] NOT NULL DEFAULT '{}',
  auto_schedule TEXT NOT NULL DEFAULT 'off' CHECK (auto_schedule IN ('off', 'weekly', 'monthly')),
  day_of_week SMALLINT,
  time_utc TEXT,
  contract_expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_owner ON projects(owner_user_id);

-- Reports (one per project per period)
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent')),
  harvest_data_snapshot JSONB,
  pdf_storage_path TEXT,
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES users(id),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_project ON reports(project_id);
CREATE INDEX idx_reports_status ON reports(status);

-- History of sent reports (for audit)
CREATE TABLE report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_emails TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_report_history_report ON report_history(report_id);

-- Uploaded files (transcripts, PDF notes) per project
CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('transcript', 'pdf_note')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_files_project ON project_files(project_id);

-- Row Level Security: enabled but permissive for now
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_all" ON users FOR ALL USING (true);
CREATE POLICY "user_integrations_all" ON user_integrations FOR ALL USING (true);
CREATE POLICY "projects_all" ON projects FOR ALL USING (true);
CREATE POLICY "reports_all" ON reports FOR ALL USING (true);
CREATE POLICY "report_history_all" ON report_history FOR ALL USING (true);
CREATE POLICY "project_files_all" ON project_files FOR ALL USING (true);
CREATE POLICY "invites_all" ON invites FOR ALL USING (true);
