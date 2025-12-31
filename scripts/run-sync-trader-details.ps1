[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectRef = 'xgvaibxxiwfraklfbwey',

  [Parameter(Mandatory = $false)]
  [string]$KeyFile = "secrets\supabase_service_role_key.txt",

  [Parameter(Mandatory = $true)]
  [string]$Username,

  [Parameter(Mandatory = $false)]
  [ValidateSet('investor_details','risk_score','metrics','portfolio','trades')]
  [string]$JobType = 'trades',

  [Parameter(Mandatory = $false)]
  [int]$TimeoutSec = 120
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
$uri = "$base/functions/v1/sync-trader-details"

$headers = @{
  apikey        = $key
  Authorization = "Bearer $key"
  'Content-Type' = 'application/json'
}

$body = @{ username = $Username; job_type = $JobType } | ConvertTo-Json

Write-Host "Calling sync-trader-details..." -ForegroundColor Cyan
Write-Host "- URL: $uri" -ForegroundColor Cyan
Write-Host "- Key file: $keyPath" -ForegroundColor Cyan
Write-Host "- username=$Username job_type=$JobType" -ForegroundColor Cyan

$resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -TimeoutSec $TimeoutSec
"sync-trader-details response:"
$resp | ConvertTo-Json -Depth 10
