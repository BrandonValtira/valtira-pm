-- Allow 'revoked' on users.status (member revoke + invite revoke flows update to this value)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('invited', 'active', 'revoked'));
