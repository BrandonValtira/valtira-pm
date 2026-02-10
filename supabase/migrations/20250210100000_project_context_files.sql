-- Project context for Release 2: Meet recordings, PDFs, and file_type for project_files
-- project_files already exists with file_type IN ('transcript', 'pdf_note')
-- Add 'meet_recording' for Google Drive Meet recordings (storage_path = drive file id)
ALTER TABLE project_files
  DROP CONSTRAINT IF EXISTS project_files_file_type_check;
ALTER TABLE project_files
  ADD CONSTRAINT project_files_file_type_check
  CHECK (file_type IN ('transcript', 'pdf_note', 'meet_recording'));

-- Optional: metadata for meet recordings (drive link, etc.)
ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
COMMENT ON COLUMN project_files.metadata IS 'Optional: drive_file_id, web_view_link, etc. for meet_recordings';

-- Storage: create a bucket named "project-files" in Supabase Dashboard > Storage for PDF uploads.
