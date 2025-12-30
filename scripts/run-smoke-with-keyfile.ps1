[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectRef = 'xgvaibxxiwfraklfbwey',

  [Parameter(Mandatory = $false)]
  [string]$KeyFile = "secrets\supabase_service_role_key.txt",

  [Parameter(Mandatory = $false)]
  [int]$RecentMinutes = 30,

  [Parameter(Mandatory = $false)]
  [switch]$KickWorker,

  [Parameter(Mandatory = $false)]
  [int]$KickWorkerWaitSeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-KeyFile {
  param([Parameter(Mandatory=$true)][string]$Path)

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

  $candidates = @()
  if ([System.IO.Path]::IsPathRooted($Path)) {
    $candidates += $Path
  } else {
    $candidates += (Join-Path $repoRoot $Path)
    $candidates += (Join-Path (Get-Location).Path $Path)
    # Back-compat: older default path
    $candidates += (Join-Path $repoRoot "secrets\supabase_service_role_key.txt")
  }

  $resolved = $null
  foreach ($cand in $candidates) {
    if (Test-Path -LiteralPath $cand) {
      $resolved = $cand
      break
    }
  }

  if ($null -eq $resolved) {
    $attempts = ($candidates | ForEach-Object { "- $_" }) -join "`n"
    throw "Key file not found. Tried:`n$attempts`n`nCreate secrets/supabase_service_role_key.txt and paste the service_role key inside (single line)."
  }

  $script:ResolvedKeyFilePath = $resolved

  $raw = Get-Content -LiteralPath $resolved -Raw
  if ($null -eq $raw) { $raw = '' }

  # Remove BOM/whitespace and control chars
  $key = $raw.Trim()
  $key = ($key -replace '[\x00-\x1F\x7F]','')

  # Key should look like a JWT (3 dot-separated parts)
  $dotCount = (($key -split '\.').Count - 1)
  if ($dotCount -ne 2) {
    throw "Key file contents do not look like a Supabase JWT (expected exactly 2 dots). Got dots=$dotCount.\nMake sure the file contains ONLY the service_role key."
  }

  return $key
}

$env:SUPABASE_URL = "https://$ProjectRef.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = Read-KeyFile -Path $KeyFile

Write-Host "Using SUPABASE_URL=$env:SUPABASE_URL" -ForegroundColor Cyan
if ($script:ResolvedKeyFilePath) {
  Write-Host "Using key file: $script:ResolvedKeyFilePath" -ForegroundColor Cyan
} else {
  Write-Host "Using key file: $KeyFile" -ForegroundColor Cyan
}

# Run the existing smoke test
$smoke = Join-Path $PSScriptRoot 'smoke-validate.ps1'
if ($KickWorker) {
  & $smoke -RecentMinutes $RecentMinutes -KickWorker -KickWorkerWaitSeconds $KickWorkerWaitSeconds
} else {
  & $smoke -RecentMinutes $RecentMinutes
}
exit $LASTEXITCODE
