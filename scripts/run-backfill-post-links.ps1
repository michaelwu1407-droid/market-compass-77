[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectRef = 'xgvaibxxiwfraklfbwey',

  [Parameter(Mandatory = $false)]
  [string]$KeyFile = "secrets\supabase_service_role_key.txt",

  [Parameter(Mandatory = $false)]
  [int]$Limit = 200,

  [Parameter(Mandatory = $false)]
  [int]$Offset = 0,

  [Parameter(Mandatory = $false)]
  [int]$MaxPages = 10,

  [Parameter(Mandatory = $false)]
  [switch]$DryRun,

  [Parameter(Mandatory = $false)]
  [switch]$CreateMissingTraders,

  [Parameter(Mandatory = $false)]
  [int]$TimeoutSec = 90
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
    if (Test-Path -LiteralPath $cand) { return (Resolve-Path -LiteralPath $cand).Path }
  }
  $attempts = ($candidates | ForEach-Object { "- $_" }) -join "`n"
  throw "Key file not found. Tried:`n$attempts"
}

function Read-ServiceRoleKey {
  param([Parameter(Mandatory = $true)][string]$Path)
  $raw = Get-Content -LiteralPath $Path -Raw
  if ($null -eq $raw) { $raw = '' }
  $key = ($raw.Trim() -replace '[\x00-\x1F\x7F]','')
  $dotCount = (($key -split '\.').Count - 1)
  if ($dotCount -ne 2) { throw "Key file does not look like a JWT (expected exactly 2 dots)." }
  return $key
}

$keyPath = Resolve-KeyFilePath -Path $KeyFile
$key = Read-ServiceRoleKey -Path $keyPath

$base = "https://$ProjectRef.supabase.co".TrimEnd('/')
$uriBase = "$base/functions/v1/fix-posts"

$headers = @{
  apikey = $key
  Authorization = "Bearer $key"
  'Content-Type' = 'application/json'
}

function ClampInt {
  param(
    [Parameter(Mandatory = $true)][int]$Value,
    [Parameter(Mandatory = $true)][int]$Min,
    [Parameter(Mandatory = $true)][int]$Max
  )
  return [Math]::Max($Min, [Math]::Min($Max, $Value))
}

$limitClamped = ClampInt -Value $Limit -Min 1 -Max 2000
$offsetClamped = [Math]::Max(0, $Offset)
$pagesClamped = ClampInt -Value $MaxPages -Min 1 -Max 200

Write-Host "Calling fix-posts (post link/backfill)..." -ForegroundColor Cyan
Write-Host "- URL: $uriBase" -ForegroundColor Cyan
Write-Host "- Key file: $keyPath" -ForegroundColor Cyan
Write-Host "- limit=$limitClamped offset=$offsetClamped max_pages=$pagesClamped dry_run=$([bool]$DryRun)" -ForegroundColor Cyan
if ($DryRun) {
  Write-Host "- Note: fix-posts does not support dry-run; this flag has no effect." -ForegroundColor Yellow
}
if ($CreateMissingTraders) {
  Write-Host "- create_missing_traders=true" -ForegroundColor Yellow
}

$currentOffset = $offsetClamped
for ($page = 1; $page -le $pagesClamped; $page++) {
  $body = @{
    _note = 'fix-posts uses query params; body is ignored'
  } | ConvertTo-Json

  Write-Host "\nPage $page/$pagesClamped (offset=$currentOffset, limit=$limitClamped)" -ForegroundColor Cyan
  $createParam = if ($CreateMissingTraders) { '&create_missing_traders=true' } else { '' }
  $uri = "${uriBase}?only_missing_trader_id=true&limit=$limitClamped&offset=$currentOffset$createParam"
  $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -TimeoutSec $TimeoutSec
  $resp | ConvertTo-Json -Depth 10

  if ($resp.PSObject.Properties.Name -contains 'done' -and [bool]$resp.done) {
    Write-Host "Done." -ForegroundColor Green
    break
  }

  if ($resp.PSObject.Properties.Name -contains 'next_offset' -and $null -ne $resp.next_offset) {
    $currentOffset = [int]$resp.next_offset
  } else {
    $currentOffset = $currentOffset + $limitClamped
  }
}
