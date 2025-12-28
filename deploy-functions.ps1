# PowerShell script to deploy Supabase Edge Functions
# Run this script if you have Supabase CLI installed

$PROJECT_ID = "xgvaibxxiwfraklfbwey"

Write-Host "Deploying Supabase Edge Functions..." -ForegroundColor Green

$functions = @(
    "scrape-posts",
    "fix-posts",
    "trigger-sync",
    "sync-traders",
    "sync-trader-details",
    "sync-worker",
    "enqueue-sync-jobs",
    "process-sync-job",
    "dispatch-sync-jobs",
    "verify-deployment",
    "force-process-queue",
    "sync-diagnostics"
)

foreach ($func in $functions) {
    Write-Host "`nDeploying $func..." -ForegroundColor Yellow
    supabase functions deploy $func --project-ref $PROJECT_ID
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to deploy $func" -ForegroundColor Red
    } else {
        Write-Host "Successfully deployed $func" -ForegroundColor Green
    }
}

Write-Host "`nDeployment complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Go to Admin Sync Page" -ForegroundColor White
Write-Host "2. Click 'Verify Deployment'" -ForegroundColor White
Write-Host "3. Click 'Force Process Queue' to clear pending jobs" -ForegroundColor White

