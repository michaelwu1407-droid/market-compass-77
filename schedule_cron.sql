-- NOTE: On Supabase, `pg_cron` and `pg_net` are typically already installed.
-- If you attempt `CREATE EXTENSION` on a managed project, it may fail due to
-- privilege scripts. This file intentionally does NOT run CREATE EXTENSION.

-- Idempotency: remove existing jobs (if any) before scheduling
DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'scrape-posts-hourly',
      'fetch-daily-prices-daily',
      'scrape-daily-movers-daily',
      'sync-trader-details-4h'
    )
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END $$;

-- Schedule scrape-posts every hour
-- Calls the edge function 'scrape-posts'
SELECT cron.schedule(
  'scrape-posts-hourly',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://<PROJECT_REF>.supabase.co/functions/v1/scrape-posts',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || '<SERVICE_ROLE_KEY>'
      ),
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
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || '<SERVICE_ROLE_KEY>'
      ),
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
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || '<SERVICE_ROLE_KEY>'
      ),
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
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || '<SERVICE_ROLE_KEY>'
      ),
      body:='{}'::jsonb
    ) as request_id;
  $$
);
