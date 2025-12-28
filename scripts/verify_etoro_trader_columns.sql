-- Verify eToro trader columns exist
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='traders' AND column_name='etoro_cid'
  ) AS has_etoro_cid,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='traders' AND column_name='win_ratio'
  ) AS has_win_ratio,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='traders' AND column_name='last_etoro_sync_at'
  ) AS has_last_etoro_sync_at,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='traders' AND column_name='trader_source'
  ) AS has_trader_source;

-- Show indexes we expect
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename='traders'
  AND indexname IN ('traders_etoro_cid_idx','traders_etoro_cid_unique')
ORDER BY indexname;
