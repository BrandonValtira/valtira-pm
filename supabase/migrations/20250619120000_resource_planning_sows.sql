-- SOW PDFs per resource planning project (multiple per project)
CREATE TABLE IF NOT EXISTS resource_planning_project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rp_project_files_project ON resource_planning_project_files(project_name);

ALTER TABLE resource_planning_project_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resource_planning_project_files_all" ON resource_planning_project_files;
CREATE POLICY "resource_planning_project_files_all" ON resource_planning_project_files FOR ALL USING (true);

-- Optional contract expiry for budget burn (can also parse from Harvest project names)
ALTER TABLE resource_planning_projects
  ADD COLUMN IF NOT EXISTS contract_expiry_date DATE;
