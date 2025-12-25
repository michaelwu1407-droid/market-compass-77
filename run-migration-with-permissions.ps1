# Run Supabase migration with permissions
$accessToken = "sbp_14ca1d97edc258b528506bde360f05b03ecef08c"
$projectRef = "xgvaibxxiwfraklfbwey"

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
}

Write-Host "Step 1: Granting permissions..." -ForegroundColor Yellow

# First, grant permissions
$grantSQL = @"
GRANT ALL ON cron.job TO postgres;
GRANT USAGE ON SCHEMA cron TO postgres;
"@

$grantBody = @{
    query = $grantSQL
} | ConvertTo-Json

try {
    $grantResponse = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" -Method Post -Headers $headers -Body $grantBody
    Write-Host "Permissions granted!" -ForegroundColor Green
} catch {
    Write-Host "Note: Grant may have failed (might already be granted): $_" -ForegroundColor Yellow
}

Write-Host "`nStep 2: Running migration..." -ForegroundColor Yellow

# Then run the migration
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

$migrationBody = @{
    query = $migrationSQL
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" -Method Post -Headers $headers -Body $migrationBody
    Write-Host "`nMigration successful!" -ForegroundColor Green
    Write-Host "Cron jobs have been set up:" -ForegroundColor Green
    Write-Host "  - sync-worker: Every 2 minutes" -ForegroundColor Cyan
    Write-Host "  - discover-new-traders: Every hour" -ForegroundColor Cyan
} catch {
    Write-Host "`nError running migration: $_" -ForegroundColor Red
    $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "Details: $($errorDetails.message)" -ForegroundColor Yellow
    Write-Host "`nYou may need to run this manually in Supabase SQL Editor with proper permissions." -ForegroundColor Yellow
}

