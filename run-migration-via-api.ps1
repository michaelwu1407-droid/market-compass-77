param(
    [Parameter(Mandatory = $true)]
    [string]$SqlFile
)

# Run Supabase migration via Management API
$accessToken = $env:SUPABASE_ACCESS_TOKEN
if (-not $accessToken) {
    throw "Missing SUPABASE_ACCESS_TOKEN environment variable. Refusing to run without it."
}

$projectRef = $env:SUPABASE_PROJECT_REF
if (-not $projectRef) { $projectRef = "xgvaibxxiwfraklfbwey" }

# Read the migration SQL
$migrationSQL = Get-Content $SqlFile -Raw

Write-Host "Running migration via Supabase Management API..."

# Use Supabase Management API to execute SQL
$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
}

$body = ([pscustomobject]@{
    query = [string]$migrationSQL
} | ConvertTo-Json)

try {
    $response = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" -Method Post -Headers $headers -Body $body
    Write-Host "Migration successful!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 20
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Yellow
}

