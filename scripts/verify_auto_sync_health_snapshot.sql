-- Auto-sync health snapshot (run twice ~6-10 minutes apart)
-- Safe: contains no secrets

-- Current queue state
SELECT
  status,
  count(*) AS count,
  min(created_at) AS oldest_created_at,
  max(created_at) AS newest_created_at
FROM sync_jobs
GROUP BY status
ORDER BY status;

-- Throughput in last 30 minutes
SELECT
  count(*) FILTER (WHERE status = 'completed') AS completed_last_30m,
  count(*) FILTER (WHERE status = 'failed') AS failed_last_30m,
  count(*) FILTER (WHERE status IN ('processing','in_progress')) AS processing_now,
  count(*) FILTER (WHERE status = 'pending') AS pending_now
FROM sync_jobs
WHERE created_at >= now() - interval '30 minutes'
  OR started_at >= now() - interval '30 minutes'
  OR finished_at >= now() - interval '30 minutes';

-- Failures breakdown in last 60 minutes
SELECT
  COALESCE(NULLIF(error_message, ''), '(no error_message)') AS error_message,
  count(*) AS failed_count
FROM sync_jobs
WHERE status = 'failed'
  AND COALESCE(finished_at, started_at, created_at) >= now() - interval '60 minutes'
GROUP BY 1
ORDER BY failed_count DESC
LIMIT 20;

-- Stuck processing (older than 20 minutes) - should be near zero
SELECT
  count(*) AS stuck_processing_over_20m
FROM sync_jobs
WHERE status IN ('processing','in_progress')
  AND COALESCE(started_at, created_at) < now() - interval '20 minutes';
