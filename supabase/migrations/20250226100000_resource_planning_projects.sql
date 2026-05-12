-- Project metadata: display title and Harvest associations.
-- project_name matches resource_planning_allocations.project_name.
CREATE TABLE IF NOT EXISTS resource_planning_projects (
  project_name TEXT PRIMARY KEY,
  display_title TEXT,
  harvest_project_ids INTEGER[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE resource_planning_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_planning_projects_all" ON resource_planning_projects FOR ALL USING (true);
