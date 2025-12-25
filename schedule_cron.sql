
SELECT cron.schedule(
  'dispatch-sync-jobs-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/dispatch-sync-jobs',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTI2MDYwMDgsImV4cCI6MjAyODE4MjAwOH0.6_--F6a7i5y5TrQ_b-3Stx_32hOAF33nS3W3_d2A3lE"}'
  )
  $$
);
