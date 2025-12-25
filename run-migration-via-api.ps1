# Run Supabase migration via Management API
$accessToken = "sbp_14ca1d97edc258b528506bde360f05b03ecef08c"
$projectRef = "xgvaibxxiwfraklfbwey"

# Read the migration SQL
$migrationSQL = @"
-- Remove old cron jobs
DELETE FROM cron.job WHERE jobname = 'invoke-sync-worker';
DELETE FROM cron.job WHERE jobname = 'discover-new-traders';

-- Schedule sync-worker to run every 2 minutes
SELECT cron.schedule(
    'invoke-sync-worker',
    '*/2 * * * *',
    `$func`$SELECT net.http_post(url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker', headers:='{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M"}'::jsonb)`$func`$
);

-- Schedule discover-new-traders to run every hour
SELECT cron.schedule(
    'discover-new-traders',
    '0 * * * *',
    `$func`$SELECT net.http_post(url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs', headers:='{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M", "Content-Type": "application/json"}'::jsonb, body:='{"sync_traders": true}'::jsonb)`$func`$
);
"@

Write-Host "Running migration via Supabase Management API..."

# Use Supabase Management API to execute SQL
$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
}

$body = @{
    query = $migrationSQL
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" -Method Post -Headers $headers -Body $body
    Write-Host "Migration successful!" -ForegroundColor Green
    Write-Host $response
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Yellow
}

