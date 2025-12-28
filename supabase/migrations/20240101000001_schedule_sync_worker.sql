-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to the postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- Remove any old cron jobs for this function to prevent duplicates
DELETE FROM cron.job WHERE command LIKE '%sync-worker%';

-- Schedule the 'sync-worker' to run every 5 minutes
-- The worker will then pull from the queue.
SELECT cron.schedule(
    'invoke-sync-worker',
    '*/5 * * * *', -- Every 5 minutes
    $$
    SELECT net.http_post(
        url:='https://purbxytpqvfbgrmfglws.supabase.co/functions/v1/sync-worker',
        headers:='{}'
    )
    $$
);
