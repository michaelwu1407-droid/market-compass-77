-- Safe sync_datapoints maintenance migration.
--
-- Replaces the historical `20251227_fix_sync_datapoints.sql` migration which used
-- a non-standard version and performed a TRUNCATE-based dedupe.
--
-- This version is:
-- - 14-digit timestamped (compatible with Supabase CLI migration history)
-- - Non-destructive
-- - Idempotent

BEGIN;

ALTER TABLE IF EXISTS public.sync_datapoints
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS attempts_total int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts_failed int DEFAULT 0;

-- Add a uniqueness constraint only if it doesn't already exist AND it won't fail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'unique_domain_datapoint'
      AND c.conrelid = 'public.sync_datapoints'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.sync_datapoints
      GROUP BY domain, datapoint_key
      HAVING COUNT(*) > 1
      LIMIT 1
    ) THEN
      RAISE NOTICE 'sync_datapoints has duplicates for (domain, datapoint_key); skipping unique_domain_datapoint constraint';
    ELSE
      EXECUTE 'ALTER TABLE public.sync_datapoints ADD CONSTRAINT unique_domain_datapoint UNIQUE (domain, datapoint_key)';
    END IF;
  END IF;
END$$;

COMMIT;
