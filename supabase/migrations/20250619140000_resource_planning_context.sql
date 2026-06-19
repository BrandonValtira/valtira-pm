-- Project context (Jira keys, meet transcripts, materials) on resource planning projects.
-- SOW uploads use file_type = 'sow' and appear automatically in additional materials.

ALTER TABLE resource_planning_projects
  ADD COLUMN IF NOT EXISTS jira_project_keys TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE resource_planning_project_files
  ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'sow',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE resource_planning_project_files
  DROP CONSTRAINT IF EXISTS resource_planning_project_files_file_type_check;

ALTER TABLE resource_planning_project_files
  ADD CONSTRAINT resource_planning_project_files_file_type_check
  CHECK (file_type IN ('sow', 'pdf_note', 'meet_recording'));
