-- Run this entire script in Supabase Dashboard > SQL Editor > New query (paste and Run)
-- Project context for Release 2: Meet recordings, PDFs, and file_type for project_files

ALTER TABLE project_files
  DROP CONSTRAINT IF EXISTS project_files_file_type_check;

ALTER TABLE project_files
  ADD CONSTRAINT project_files_file_type_check
  CHECK (file_type IN ('transcript', 'pdf_note', 'meet_recording'));

ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN project_files.metadata IS 'Optional: drive_file_id, web_view_link, etc. for meet_recordings';
