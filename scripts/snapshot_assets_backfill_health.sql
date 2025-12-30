-- Asset enrichment/backfill health snapshot
-- Safe: read-only

-- How many assets still lack sector (or are Unknown)
SELECT
  count(*) FILTER (WHERE sector IS NULL) AS sector_null,
  count(*) FILTER (WHERE sector = 'Unknown') AS sector_unknown,
  count(*) AS total_assets
FROM public.assets;

-- Price history coverage (if marker column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assets'
      AND column_name = 'price_history_synced_at'
  ) THEN
    RAISE NOTICE 'price_history_synced_at exists';
  ELSE
    RAISE NOTICE 'price_history_synced_at missing';
  END IF;
END $$;

-- Count assets without any price_history rows
SELECT
  count(*) AS assets_without_any_price_history
FROM public.assets a
LEFT JOIN public.price_history ph
  ON ph.asset_id = a.id
WHERE ph.asset_id IS NULL;

-- Oldest/newest price_history_synced_at (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assets'
      AND column_name = 'price_history_synced_at'
  ) THEN
    -- This SELECT will show up in SQL editors; for run-migration-via-api (single result set)
    -- you may want to run the below SELECT separately.
    NULL;
  END IF;
END $$;

-- Assets considered stale for backfill (7 days) if marker exists
-- NOTE: If the column doesn't exist yet, use assets_without_any_price_history above.
SELECT
  count(*) AS assets_stale_over_7d
FROM public.assets
WHERE COALESCE(price_history_synced_at, '1970-01-01'::timestamptz) < now() - interval '7 days';
