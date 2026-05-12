-- Store Harvest project names for display when IDs are linked.
ALTER TABLE resource_planning_projects
  ADD COLUMN IF NOT EXISTS harvest_project_names TEXT[] NOT NULL DEFAULT '{}';
