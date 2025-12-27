BEGIN;

-- Add missing columns required by new logic
ALTER TABLE IF EXISTS sync_datapoints
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS attempts_total int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts_failed int DEFAULT 0;

-- Make a deduplicated snapshot keeping the most recent row per (domain, datapoint_key)
CREATE TEMP TABLE tmp_sync_datapoints AS
SELECT DISTINCT ON (domain, datapoint_key) *
FROM sync_datapoints
ORDER BY domain, datapoint_key, COALESCE(last_attempt_at, updated_at, created_at) DESC;

TRUNCATE sync_datapoints;

INSERT INTO sync_datapoints
SELECT * FROM tmp_sync_datapoints;

DROP TABLE tmp_sync_datapoints;

-- Add unique constraint to prevent future duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'unique_domain_datapoint'
  ) THEN
    ALTER TABLE sync_datapoints ADD CONSTRAINT unique_domain_datapoint UNIQUE (domain, datapoint_key);
  END IF;
END$$;

COMMIT;
