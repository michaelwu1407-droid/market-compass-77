-- Diagnose why sync_jobs are not completing
-- Safe: contains no secrets
-- Run in Supabase SQL editor.

-- 1) High-level counts
SELECT
  now() AS ts,
  status,
  job_type,
  count(*)::int AS jobs
FROM public.sync_jobs
GROUP BY status, job_type
ORDER BY jobs DESC;

-- 2) Pending age
SELECT
  now() AS ts,
  count(*) FILTER (WHERE status = 'pending')::int AS pending_total,
  min(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_created_at,
  max(created_at) FILTER (WHERE status = 'pending') AS newest_pending_created_at
FROM public.sync_jobs;

-- 3) In-progress / stuck jobs (started long ago)
SELECT
  now() AS ts,
  count(*) FILTER (WHERE status IN ('in_progress','running'))::int AS in_progress_total,
  min(started_at) FILTER (WHERE status IN ('in_progress','running')) AS oldest_started_at,
  max(started_at) FILTER (WHERE status IN ('in_progress','running')) AS newest_started_at
FROM public.sync_jobs;

-- 4) Recent completions / failures
-- NOTE: This project standardizes on `finished_at`. Some older schemas had `completed_at`.
-- If your schema does not have `completed_at` (common), this query will still work.
SELECT
  date_trunc('minute', finished_at) AS minute,
  count(*) FILTER (WHERE status = 'completed')::int AS completed,
  count(*) FILTER (WHERE status = 'failed')::int AS failed
FROM public.sync_jobs
WHERE finished_at >= now() - interval '2 hours'
GROUP BY 1
ORDER BY 1 DESC;

-- 5) Top failure reasons (if failures exist)
SELECT
  left(coalesce(error_message, ''), 180) AS error_prefix,
  count(*)::int AS failed
FROM public.sync_jobs
WHERE status = 'failed'
  AND created_at >= now() - interval '24 hours'
GROUP BY 1
ORDER BY failed DESC
LIMIT 20;

-- 6) Oldest pending jobs (what the system is stuck behind)
SELECT
  id,
  trader_id,
  job_type,
  created_at,
  started_at,
  finished_at,
  retry_count,
  left(coalesce(error_message, ''), 180) AS error_prefix
FROM public.sync_jobs
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 50;
