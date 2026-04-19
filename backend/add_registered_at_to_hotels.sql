ALTER TABLE hotels
ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE hotels
SET registered_at = COALESCE(registered_at, created_at, CURRENT_TIMESTAMP)
WHERE registered_at IS NULL;
