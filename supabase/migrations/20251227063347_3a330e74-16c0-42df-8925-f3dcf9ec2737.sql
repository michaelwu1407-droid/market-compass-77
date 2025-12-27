-- Clean up existing duplicate datapoints (keep newest by id)
DELETE FROM sync_datapoints a
USING sync_datapoints b  
WHERE a.id < b.id
AND a.run_id = b.run_id
AND a.datapoint_key = b.datapoint_key;

-- Ensure etoro_username column exists on posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS etoro_username TEXT;

-- Add index if not exists
CREATE INDEX IF NOT EXISTS idx_posts_etoro_username ON posts(etoro_username);