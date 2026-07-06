ALTER TABLE reports ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reminder_week TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS approval_email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS approval_email_last_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN reports.reminder_count IS 'Reminder emails sent in reminder_week (max 2 per week).';
COMMENT ON COLUMN reports.reminder_week IS 'Monday-start week key (Central) for reminder_count.';
COMMENT ON COLUMN reports.approval_email_attempts IS 'Failed/partial approval email send attempts (throttled).';
