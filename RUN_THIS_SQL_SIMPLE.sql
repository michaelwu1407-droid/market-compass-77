-- Fix the sync-worker cron job with correct URL and ensure it's active
-- Step 1: Remove old cron jobs
DELETE FROM cron.job WHERE jobname = 'invoke-sync-worker';
DELETE FROM cron.job WHERE jobname = 'discover-new-traders';

-- Step 2: Schedule sync-worker to run every 2 minutes
SELECT cron.schedule(
    'invoke-sync-worker',
    '*/2 * * * *',
    $func$
    SELECT net.http_post(
        url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker',
        headers:='{}'::jsonb
    )
    $func$
);

-- Step 3: Schedule sync-traders to run every hour to discover new traders
SELECT cron.schedule(
    'discover-new-traders',
    '0 * * * *',
    $func$
    SELECT net.http_post(
        url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs',
        headers:='{ "Content-Type": "application/json"}'::jsonb,
        body:='{"sync_traders": true}'::jsonb
    )
    $func$
);

