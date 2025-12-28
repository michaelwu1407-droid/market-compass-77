
SELECT cron.schedule(
  'dispatch-sync-jobs-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/dispatch-sync-jobs',
    headers:='{"Content-Type": "application/json"}'
  )
  $$
);
