-- Approval flow: rejected status, timestamps for approval request and reminder emails
ALTER TABLE reports ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Allow status 'rejected'
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'rejected'));
