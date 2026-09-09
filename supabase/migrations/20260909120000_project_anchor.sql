-- Project Anchor: Jira worklog → Harvest time entry sync

CREATE TABLE IF NOT EXISTS project_anchor_user_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jira_account_id TEXT NOT NULL UNIQUE,
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

INSERT INTO project_anchor_sync_state (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE project_anchor_user_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_anchor_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_anchor_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_anchor_user_maps_all" ON project_anchor_user_maps;
CREATE POLICY "project_anchor_user_maps_all" ON project_anchor_user_maps FOR ALL USING (true);

DROP POLICY IF EXISTS "project_anchor_entries_all" ON project_anchor_entries;
CREATE POLICY "project_anchor_entries_all" ON project_anchor_entries FOR ALL USING (true);

DROP POLICY IF EXISTS "project_anchor_sync_state_all" ON project_anchor_sync_state;
CREATE POLICY "project_anchor_sync_state_all" ON project_anchor_sync_state FOR ALL USING (true);
