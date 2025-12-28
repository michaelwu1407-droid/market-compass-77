-- Kick a small CID enrichment batch without needing local keys.
-- Uses pg_net's net.http_post via Supabase Management API.

-- 1) Enqueue only etoro_profile jobs (no Bullaware jobs)
SELECT net.http_post(
  url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs',
  headers:='{ "Content-Type": "application/json" }'::jsonb,
  body:='{
    "sync_bullaware_jobs": false,
    "sync_etoro_profiles": true,
    "etoro_profiles_limit": 25,
    "etoro_profiles_stale_hours": 24,
    "force": false
  }'::jsonb
);

-- 2) Dispatch one batch (processes up to ~10 jobs)
SELECT net.http_post(
  url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/dispatch-sync-jobs',
  headers:='{ "Content-Type": "application/json" }'::jsonb,
  body:='{}'::jsonb
);
