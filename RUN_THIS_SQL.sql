-- Fix the sync-worker cron job with correct URL and ensure it's active
-- Remove old cron jobs
DELETE FROM cron.job WHERE jobname = 'invoke-sync-worker';

-- Schedule sync-worker to run every 2 minutes (more frequent for better processing)
SELECT cron.schedule(
    'invoke-sync-worker',
    '*/2 * * * *', -- Every 2 minutes
    $$
    SELECT net.http_post(
        url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker',
        headers:='{}'::jsonb
    )
    $$
);

-- Schedule sync-traders to run every hour to discover new traders
SELECT cron.schedule(
    'discover-new-traders',
    '0 * * * *', -- Every hour
    $$
    SELECT net.http_post(
        url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs',
        headers:='{ "Content-Type": "application/json"}'::jsonb,
        body:='{"sync_traders": true}'::jsonb
    )
    $$
);

