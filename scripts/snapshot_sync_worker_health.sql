-- Single-shot health snapshot for pg_cron -> sync-worker -> holdings
-- Designed to return ONE result set (works well with run-migration-via-api.ps1)

WITH
job AS (
  SELECT jobid, jobname, schedule, active, command
  FROM cron.job
  WHERE jobname = 'sync_worker_every_2_min'
  LIMIT 1
),
last_run AS (
  SELECT jrd.jobid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN job j ON j.jobid = jrd.jobid
  ORDER BY jrd.start_time DESC
  LIMIT 1
),
assets AS (
  SELECT count(*)::int AS assets_rows FROM public.assets
),
holdings AS (
  SELECT count(*)::int AS holdings_rows_total FROM public.trader_holdings
),
amit AS (
  SELECT count(*)::int AS holdings_rows_amit
  FROM public.trader_holdings
  WHERE trader_id = '304d92a1-c132-444e-b12a-cdc215d8f3c0'
),
pending AS (
  SELECT
    count(*) FILTER (WHERE status = 'pending')::int AS pending_total,
    count(*) FILTER (WHERE status = 'pending' AND job_type = 'portfolio')::int AS pending_portfolio,
    max(created_at) FILTER (WHERE status = 'pending') AS newest_pending_created_at,
    min(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_created_at
  FROM public.sync_jobs
),
recent_complete AS (
  SELECT max(coalesce(finished_at, started_at, created_at)) AS last_completed_at
  FROM public.sync_jobs
  WHERE status = 'completed'
)
SELECT
  (SELECT jobid FROM job) AS cron_jobid,
  (SELECT active FROM job) AS cron_active,
  (SELECT schedule FROM job) AS cron_schedule,
  (SELECT start_time FROM last_run) AS cron_last_start_time,
  (SELECT status FROM last_run) AS cron_last_status,
  (SELECT end_time FROM last_run) AS cron_last_end_time,
  left(coalesce((SELECT return_message FROM last_run), ''), 240) AS cron_last_return_message,
  (SELECT assets_rows FROM assets) AS assets_rows,
  (SELECT holdings_rows_total FROM holdings) AS holdings_rows_total,
  (SELECT holdings_rows_amit FROM amit) AS holdings_rows_amit,
  (SELECT pending_total FROM pending) AS pending_total,
  (SELECT pending_portfolio FROM pending) AS pending_portfolio,
  (SELECT oldest_pending_created_at FROM pending) AS oldest_pending_created_at,
  (SELECT newest_pending_created_at FROM pending) AS newest_pending_created_at,
  (SELECT last_completed_at FROM recent_complete) AS last_completed_at;
