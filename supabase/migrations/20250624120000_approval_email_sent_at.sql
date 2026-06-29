ALTER TABLE reports ADD COLUMN IF NOT EXISTS approval_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN reports.approval_email_sent_at IS 'When the owner was emailed to review this report (approval request).';
