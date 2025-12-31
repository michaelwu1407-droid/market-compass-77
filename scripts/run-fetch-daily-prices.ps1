[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectRef = 'xgvaibxxiwfraklfbwey',

  [Parameter(Mandatory = $false)]
  [string]$KeyFile = "secrets\supabase_service_role_key.txt",

  [Parameter(Mandatory = $false)]
  [int]$MaxAssets = 0,

  [Parameter(Mandatory = $false)]
  [int]$TimeoutSec = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-KeyFilePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

  $candidates = @()
  if ([System.IO.Path]::IsPathRooted($Path)) {
    $candidates += $Path
  } else {
    $candidates += (Join-Path $repoRoot $Path)
    $candidates += (Join-Path (Get-Location).Path $Path)
    $candidates += (Join-Path $repoRoot "secrets\supabase_service_role_key.txt")
  }

  foreach ($cand in $candidates) {
    if (Test-Path -LiteralPath $cand) {
      return (Resolve-Path -LiteralPath $cand).Path
    }
  }

  $attempts = ($candidates | ForEach-Object { "- $_" }) -join "`n"
  throw "Key file not found. Tried:`n$attempts"
}

function Read-ServiceRoleKey {
  param([Parameter(Mandatory = $true)][string]$Path)

  $raw = Get-Content -LiteralPath $Path -Raw
  if ($null -eq $raw) { $raw = '' }

  $key = $raw.Trim()
  $key = ($key -replace '[\x00-\x1F\x7F]','')

  $dotCount = (($key -split '\.').Count - 1)
  if ($dotCount -ne 2) {
    throw "Key file contents do not look like a Supabase JWT (expected exactly 2 dots). Got dots=$dotCount."
  }

  return $key
}

$keyPath = Resolve-KeyFilePath -Path $KeyFile
$key = Read-ServiceRoleKey -Path $keyPath

$base = "https://$ProjectRef.supabase.co".TrimEnd('/')
$uri = "$base/functions/v1/fetch-daily-prices"
if ($MaxAssets -gt 0) {
  $uri = "${uri}?max_assets=$MaxAssets"
}

$headers = @{
  apikey        = $key
  Authorization = "Bearer $key"
  'Content-Type' = 'application/json'
}

Write-Host "Calling fetch-daily-prices..." -ForegroundColor Cyan
Write-Host "- URL: $uri" -ForegroundColor Cyan
Write-Host "- Key file: $keyPath" -ForegroundColor Cyan
if ($MaxAssets -gt 0) {
  Write-Host "- max_assets=$MaxAssets" -ForegroundColor Cyan
}

$resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body '{}' -TimeoutSec $TimeoutSec

"fetch-daily-prices response:"
$resp | ConvertTo-Json -Depth 10
