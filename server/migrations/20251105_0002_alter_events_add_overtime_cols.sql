-- Note: MySQL 8.0+ supports IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- If your version doesn't support it, these will fail if columns already exist
-- In that case, check manually or use a stored procedure to check first

ALTER TABLE events
  ADD COLUMN overtime_minutes INT DEFAULT 0,
  ADD COLUMN night_minutes INT DEFAULT 0;

