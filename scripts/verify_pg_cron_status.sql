-- Verify pg_cron job exists and has been firing recently
-- Safe: contains no secrets

-- 1) Find jobs that invoke dispatch-sync-jobs
SELECT
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobname ILIKE '%dispatch%'
   OR command ILIKE '%dispatch-sync-jobs%'
ORDER BY jobid;

-- 2) Recent run details for those jobs
WITH jobs AS (
  SELECT jobid
  FROM cron.job
  WHERE jobname ILIKE '%dispatch%'
     OR command ILIKE '%dispatch-sync-jobs%'
)
SELECT
  jrd.jobid,
  jrd.runid,
  jrd.status,
  jrd.start_time,
  jrd.end_time,
  jrd.return_message
FROM cron.job_run_details jrd
JOIN jobs j ON j.jobid = jrd.jobid
ORDER BY jrd.start_time DESC
LIMIT 50;

-- 3) Quick summary: last start time + success/failure counts in last 2 hours
WITH jobs AS (
  SELECT jobid
  FROM cron.job
  WHERE jobname ILIKE '%dispatch%'
     OR command ILIKE '%dispatch-sync-jobs%'
), recent AS (
  SELECT *
  FROM cron.job_run_details
  WHERE jobid IN (SELECT jobid FROM jobs)
    AND start_time >= now() - interval '2 hours'
)
SELECT
  max(start_time) AS last_start_time,
  count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
  count(*) FILTER (WHERE status = 'failed') AS failed,
  count(*) AS total
FROM recent;
