-- Fix the sync-worker cron job with correct URL and ensure it's active
-- Remove old cron jobs first
DELETE FROM cron.job WHERE jobname = 'invoke-sync-worker';
DELETE FROM cron.job WHERE jobname = 'discover-new-traders';

-- Schedule sync-worker to run every 2 minutes
SELECT cron.schedule(
    'invoke-sync-worker',
    '*/2 * * * *',
    'SELECT net.http_post(
        url:=''https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker'',
        headers:=''{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M"}''::jsonb
    )'
);

-- Schedule sync-traders to run every hour to discover new traders
SELECT cron.schedule(
    'discover-new-traders',
    '0 * * * *',
    'SELECT net.http_post(
        url:=''https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs'',
        headers:=''{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M", "Content-Type": "application/json"}''::jsonb,
        body:=''{"sync_traders": true}''::jsonb
    )'
);

