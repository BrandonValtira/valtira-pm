-- Allow Project Anchor to record Harvest timesheet locks without treating them as retryable failures.
ALTER TABLE project_anchor_entries DROP CONSTRAINT IF EXISTS project_anchor_entries_sync_status_check;
ALTER TABLE project_anchor_entries
  ADD CONSTRAINT project_anchor_entries_sync_status_check
  CHECK (sync_status IN ('pending', 'synced', 'failed', 'ignored', 'deleted', 'duplicate', 'locked'));
