-- Snapshot: etoro_profile job pipeline health

WITH
pending AS (
  SELECT
    count(*) FILTER (WHERE status = 'pending')::int AS pending_total,
    count(*) FILTER (WHERE status = 'pending' AND job_type = 'etoro_profile')::int AS pending_etoro_profile,
    count(*) FILTER (WHERE status = 'pending' AND job_type <> 'etoro_profile')::int AS pending_other,
    min(created_at) FILTER (WHERE status = 'pending' AND job_type = 'etoro_profile') AS oldest_pending_etoro_created_at,
    max(created_at) FILTER (WHERE status = 'pending' AND job_type = 'etoro_profile') AS newest_pending_etoro_created_at
  FROM public.sync_jobs
),
recent AS (
  SELECT
    count(*) FILTER (WHERE status = 'completed' AND job_type = 'etoro_profile')::int AS completed_etoro_profile,
    count(*) FILTER (WHERE status = 'failed' AND job_type = 'etoro_profile')::int AS failed_etoro_profile,
    max(coalesce(finished_at, started_at, created_at)) FILTER (WHERE status = 'completed' AND job_type = 'etoro_profile') AS last_completed_etoro_at,
    max(coalesce(finished_at, started_at, created_at)) FILTER (WHERE status = 'failed' AND job_type = 'etoro_profile') AS last_failed_etoro_at
  FROM public.sync_jobs
),
traders AS (
  SELECT
    count(*) FILTER (WHERE etoro_cid IS NOT NULL)::int AS traders_with_cid,
    count(*) FILTER (WHERE etoro_cid IS NOT NULL AND last_etoro_sync_at IS NULL)::int AS traders_with_cid_never_synced,
    max(last_etoro_sync_at) AS max_last_etoro_sync_at
  FROM public.traders
)
SELECT
  (SELECT traders_with_cid FROM traders) AS traders_with_cid,
  (SELECT traders_with_cid_never_synced FROM traders) AS traders_with_cid_never_synced,
  (SELECT max_last_etoro_sync_at FROM traders) AS max_last_etoro_sync_at,
  (SELECT pending_total FROM pending) AS pending_total,
  (SELECT pending_etoro_profile FROM pending) AS pending_etoro_profile,
  (SELECT pending_other FROM pending) AS pending_other,
  (SELECT oldest_pending_etoro_created_at FROM pending) AS oldest_pending_etoro_created_at,
  (SELECT newest_pending_etoro_created_at FROM pending) AS newest_pending_etoro_created_at,
  (SELECT completed_etoro_profile FROM recent) AS completed_etoro_profile,
  (SELECT failed_etoro_profile FROM recent) AS failed_etoro_profile,
  (SELECT last_completed_etoro_at FROM recent) AS last_completed_etoro_at,
  (SELECT last_failed_etoro_at FROM recent) AS last_failed_etoro_at;
