-- One-time fix: make Copy Traders profiles populate via pg_cron + verify data flow
-- Safe: contains no secrets (no Authorization headers)
--
-- What it does:
-- 1) Removes any pg_cron jobs that invoke dispatch-sync-jobs (including broken ones)
-- 2) Schedules sync-worker every 2 minutes (sync-worker enqueues when low + dispatches)
-- 3) Prints a quick verification report for trader holdings and recent sync activity

-- =========
-- 0) Ensure dispatch lock domain exists (guardrails)
-- =========
DO $$
BEGIN
  -- Expand sync_domain_status domain check to include dispatch_sync_jobs, if that constraint exists.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sync_domain_status'::regclass
      AND contype = 'c'
      AND conname = 'sync_domain_status_domain_check'
  ) THEN
    EXECUTE 'ALTER TABLE public.sync_domain_status DROP CONSTRAINT sync_domain_status_domain_check';
  END IF;

  -- Recreate/ensure the constraint exists with the extended allowed set.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sync_domain_status'::regclass
      AND contype = 'c'
      AND conname = 'sync_domain_status_domain_check'
  ) THEN
    EXECUTE 'ALTER TABLE public.sync_domain_status '
      || 'ADD CONSTRAINT sync_domain_status_domain_check '
      || 'CHECK (domain IN (''discussion_feed'', ''trader_profiles'', ''stock_data'', ''dispatch_sync_jobs''))';
  END IF;

  INSERT INTO public.sync_domain_status (domain, status)
  VALUES ('dispatch_sync_jobs', 'idle')
  ON CONFLICT (domain) DO NOTHING;
END $$;

-- =========
-- 1) Remove duplicate/broken cron jobs for dispatch-sync-jobs
-- =========
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname ILIKE '%dispatch%'
       OR command ILIKE '%dispatch-sync-jobs%'
       OR command ILIKE '%supabase.service_role_key%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(r.jobid);
    EXCEPTION WHEN OTHERS THEN
      DELETE FROM cron.job WHERE jobid = r.jobid;
    END;
  END LOOP;
END $$;

-- =========
-- 2) Schedule sync-worker every 2 minutes (no secrets)
-- =========
-- If a previous sync-worker schedule exists, remove it first.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname ILIKE '%sync_worker%'
       OR jobname ILIKE '%sync-worker%'
       OR command ILIKE '%/functions/v1/sync-worker%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(r.jobid);
    EXCEPTION WHEN OTHERS THEN
      DELETE FROM cron.job WHERE jobid = r.jobid;
    END;
  END LOOP;
END $$;

SELECT cron.schedule(
  'sync_worker_every_2_min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

-- =========
-- 3) Verify cron + data flow
-- =========
-- 3A) Confirm the scheduled job exists
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname = 'sync_worker_every_2_min'
ORDER BY jobid;

-- 3B) Show last 20 runs (wait ~3-5 minutes after creating schedule)
SELECT jobid, runid, status, start_time, end_time, return_message
FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'sync_worker_every_2_min')
ORDER BY start_time DESC
LIMIT 20;

-- 3C) Copy Traders health: traders with no holdings + their last sync timestamps
-- (If this list shrinks over time, the UI will start populating.)
WITH recent AS (
  SELECT id, username, etoro_username, display_name, details_synced_at
  FROM traders
  ORDER BY details_synced_at DESC NULLS LAST
  LIMIT 200
), holdings AS (
  SELECT trader_id, count(*) AS holdings_rows
  FROM trader_holdings
  GROUP BY trader_id
), jobs AS (
  SELECT trader_id,
         max(CASE WHEN status = 'completed' THEN coalesce(finished_at, started_at, created_at) END) AS last_completed_job_at,
         max(coalesce(finished_at, started_at, created_at)) AS last_job_activity_at
  FROM sync_jobs
  GROUP BY trader_id
)
SELECT
  r.id AS trader_id,
  r.username,
  r.etoro_username,
  r.display_name,
  r.details_synced_at,
  COALESCE(h.holdings_rows, 0) AS holdings_rows,
  j.last_completed_job_at,
  j.last_job_activity_at
FROM recent r
LEFT JOIN holdings h ON h.trader_id = r.id
LEFT JOIN jobs j ON j.trader_id = r.id
WHERE COALESCE(h.holdings_rows, 0) = 0
ORDER BY r.details_synced_at DESC NULLS LAST
LIMIT 50;
