-- Enable pg_cron if available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule scrape-posts every hour
-- Calls the edge function 'scrape-posts'
SELECT cron.schedule(
  'scrape-posts-hourly',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://<PROJECT_REF>.supabase.co/functions/v1/scrape-posts',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule fetch-daily-prices every day at 8 PM UTC (Market close + buffer)
SELECT cron.schedule(
  'fetch-daily-prices-daily',
  '0 20 * * 1-5',
  $$
  SELECT
    net.http_post(
      url:='https://<PROJECT_REF>.supabase.co/functions/v1/fetch-daily-prices',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule scrape-daily-movers every day at 8:30 PM UTC
SELECT cron.schedule(
  'scrape-daily-movers-daily',
  '30 20 * * 1-5',
  $$
  SELECT
    net.http_post(
      url:='https://<PROJECT_REF>.supabase.co/functions/v1/scrape-daily-movers',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule sync-trader-details every 4 hours
SELECT cron.schedule(
  'sync-trader-details-4h',
  '0 */4 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://<PROJECT_REF>.supabase.co/functions/v1/sync-trader-details',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
