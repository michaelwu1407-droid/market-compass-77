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
        headers:='{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1cmJ4eXRwcXZmYmdybWZnbHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjE0MDQ3NTcsImV4cCI6MjAzNjk4MDc1N30.2N-5r35b2T1S22-2r5o4W2n_J0up2uGAnV2S3bz8OhA"}'
    )
    $$
);
