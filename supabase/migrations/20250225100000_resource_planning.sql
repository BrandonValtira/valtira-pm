-- Resource planning: allocations per (resource name, role, project, week).
-- One row per (resource_name, role, project_name, week_start); fte is 0-1 for that week.
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
