[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$SupabaseUrl = $env:SUPABASE_URL,

  [Parameter(Mandatory = $false)]
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,

  [Parameter(Mandatory = $false)]
  [string]$AnonKey = $env:SUPABASE_ANON_KEY,

  [Parameter(Mandatory = $false)]
  [int]$RecentMinutes = 30,

  [Parameter(Mandatory = $false)]
  [switch]$KickWorker,

  [Parameter(Mandatory = $false)]
  [int]$KickWorkerWaitSeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-NotBlank {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][AllowNull()][AllowEmptyString()][string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing required value: $Name"
  }
}

function New-AuthHeaders {
  param(
    [Parameter(Mandatory = $true)][string]$Key
  )

  return @{
    apikey        = $Key
    Authorization = "Bearer $Key"
    'Content-Type' = 'application/json'
  }
}

function Invoke-Json {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('GET','POST')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [Parameter(Mandatory = $false)][string]$Body
  )

  if ($Method -eq 'POST' -and [string]::IsNullOrWhiteSpace($Body)) {
    $Body = '{}'
  }

  return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -Body $Body
}

function Test-SyncJobsCompletionColumn {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [Parameter(Mandatory = $true)][string]$Column
  )

  try {
    $base = $BaseUrl.TrimEnd('/')
    $uri = "$base/rest/v1/sync_jobs?select=$Column&limit=1"
    $reqHeaders = @{}
    foreach ($k in $Headers.Keys) { $reqHeaders[$k] = $Headers[$k] }
    $reqHeaders['Prefer'] = 'count=exact'
    $null = Invoke-WebRequest -Method Get -Uri $uri -Headers $reqHeaders -UseBasicParsing
    return $true
  } catch {
    return $false
  }
}

function Get-PostgrestCount {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [Parameter(Mandatory = $true)][string]$Table,
    [Parameter(Mandatory = $false)][string]$FilterQuery
  )

  $base = $BaseUrl.TrimEnd('/')
  # Important: PowerShell treats "$Table?select" as a variable name; use ${Table}.
  $uri = "$base/rest/v1/${Table}?select=id&limit=1"
  if (-not [string]::IsNullOrWhiteSpace($FilterQuery)) {
    if ($FilterQuery.StartsWith('&')) {
      $uri = "$uri$FilterQuery"
    } else {
      $uri = "$uri&$FilterQuery"
    }
  }

  $reqHeaders = @{}
  foreach ($k in $Headers.Keys) { $reqHeaders[$k] = $Headers[$k] }
  $reqHeaders['Prefer'] = 'count=exact'

  $resp = Invoke-WebRequest -Method Get -Uri $uri -Headers $reqHeaders -UseBasicParsing
  $contentRange = $resp.Headers['Content-Range']
  if ([string]::IsNullOrWhiteSpace($contentRange)) {
    return $null
  }

  # Examples: "0-0/123", "*/0"
  $m = [regex]::Match($contentRange, '/(\d+)$')
  if (-not $m.Success) {
    return $null
  }

  return [int]$m.Groups[1].Value
}

function Write-Check {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('PASS','WARN','FAIL')][string]$Level,
    [Parameter(Mandatory = $true)][string]$Message
  )

  $prefix = "[$Level]"
  if ($Level -eq 'PASS') {
    Write-Host "$prefix $Message" -ForegroundColor Green
    return
  }
  if ($Level -eq 'WARN') {
    Write-Host "$prefix $Message" -ForegroundColor Yellow
    return
  }
  Write-Host "$prefix $Message" -ForegroundColor Red
}

Assert-NotBlank -Name 'SUPABASE_URL (param -SupabaseUrl or env SUPABASE_URL)' -Value $SupabaseUrl

# Defensive: avoid hidden whitespace/control chars
$SupabaseUrl = ($SupabaseUrl.Trim() -replace '[\x00-\x1F\x7F]','')

$keyToUse = $null
$keyLabel = $null
if (-not [string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
  $keyToUse = $ServiceRoleKey
  $keyLabel = 'service_role'
} elseif (-not [string]::IsNullOrWhiteSpace($AnonKey)) {
  $keyToUse = $AnonKey
  $keyLabel = 'anon'
}

Assert-NotBlank -Name 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY' -Value $keyToUse

# Defensive: pasted keys sometimes include hidden control chars; headers reject them.
# Also strip anything that isn't a typical JWT/base64url character.
$keyToUse = $keyToUse.Trim()
$keyToUse = ($keyToUse -replace '[\x00-\x1F\x7F]','')
$keyToUse = ($keyToUse -replace '[^A-Za-z0-9\-_.]','')

$jwtParts = $keyToUse.Split('.')
if ($jwtParts.Length -lt 3) {
  throw "The provided key does not look like a JWT (expected 3 dot-separated parts). Re-copy the Supabase service_role key from Dashboard → Settings → API."
}

$headers = New-AuthHeaders -Key $keyToUse

Write-Host "Supabase smoke validation" -ForegroundColor Cyan
Write-Host "- URL: $($SupabaseUrl.TrimEnd('/'))"
Write-Host "- Auth: $keyLabel"
Write-Host "- Window: last $RecentMinutes minute(s)" 
Write-Host ""

$failed = $false

# 1) Sanity: functions reachable
try {
  $healthUri = "$($SupabaseUrl.TrimEnd('/'))/functions/v1/check-system-health"
  $health = Invoke-Json -Method POST -Uri $healthUri -Headers $headers -Body '{}'
  Write-Check -Level PASS -Message "Edge function check-system-health reachable (status=$($health.system_status))"
} catch {
  $failed = $true
  Write-Check -Level FAIL -Message "Edge function check-system-health not reachable: $($_.Exception.Message)"
}

try {
  $inspectUri = "$($SupabaseUrl.TrimEnd('/'))/functions/v1/inspect-db"
  $inspect = Invoke-Json -Method POST -Uri $inspectUri -Headers $headers -Body '{}'
  Write-Check -Level PASS -Message "Edge function inspect-db reachable"
} catch {
  $failed = $true
  Write-Check -Level FAIL -Message "Edge function inspect-db not reachable: $($_.Exception.Message)"
}

Write-Host ""

# 2) Core DB counts
try {
  $traderCount = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'traders'
  if ($null -eq $traderCount) {
    Write-Check -Level WARN -Message "Could not read traders count (missing Content-Range); RLS or API configuration may block counts"
  } elseif ($traderCount -le 0) {
    $failed = $true
    Write-Check -Level FAIL -Message "traders count is 0"
  } else {
    Write-Check -Level PASS -Message "traders count = $traderCount"
  }
} catch {
  $failed = $true
  Write-Check -Level FAIL -Message "Failed to query traders: $($_.Exception.Message)"
}

try {
  $assetCount = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'assets'
  if ($null -eq $assetCount) {
    Write-Check -Level WARN -Message "Could not read assets count"
  } else {
    Write-Check -Level PASS -Message "assets count = $assetCount"
  }
} catch {
  Write-Check -Level WARN -Message "Failed to query assets: $($_.Exception.Message)"
}

try {
  $postsCount = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'posts'
  if ($null -eq $postsCount) {
    Write-Check -Level WARN -Message "Could not read posts count"
  } else {
    Write-Check -Level PASS -Message "posts count = $postsCount"
  }
} catch {
  Write-Check -Level WARN -Message "Failed to query posts: $($_.Exception.Message)"
}

Write-Host ""

# 3) Sync job health (recent)
try {
  $sinceIso = (Get-Date).ToUniversalTime().AddMinutes(-1 * $RecentMinutes).ToString('o')
  $sinceEnc = [System.Uri]::EscapeDataString($sinceIso)

  $completionCol = 'finished_at'
  if (-not (Test-SyncJobsCompletionColumn -BaseUrl $SupabaseUrl -Headers $headers -Column 'finished_at')) {
    if (Test-SyncJobsCompletionColumn -BaseUrl $SupabaseUrl -Headers $headers -Column 'completed_at') {
      $completionCol = 'completed_at'
    }
  }

  $pending = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'sync_jobs' -FilterQuery 'status=eq.pending'
  $failedRecent = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'sync_jobs' -FilterQuery "status=eq.failed&created_at=gt.$sinceEnc"
  $completedRecent = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'sync_jobs' -FilterQuery ("status=eq.completed&" + $completionCol + "=gt." + $sinceEnc)
  $inProgress = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'sync_jobs' -FilterQuery 'status=in.(in_progress,running)'

  $script:SyncCompletionCol = $completionCol
  $script:CompletedRecentBeforeKick = $completedRecent

  if ($null -ne $pending) { Write-Check -Level PASS -Message "sync_jobs pending = $pending" }
  if ($null -ne $completedRecent) { Write-Check -Level PASS -Message "sync_jobs completed (last $RecentMinutes min) = $completedRecent" }
  if ($null -ne $inProgress) { Write-Check -Level PASS -Message "sync_jobs in_progress/running = $inProgress" }

  if ($null -ne $failedRecent -and $failedRecent -gt 0) {
    Write-Check -Level WARN -Message "sync_jobs failed (last $RecentMinutes min) = $failedRecent"
  } elseif ($null -ne $failedRecent) {
    Write-Check -Level PASS -Message "sync_jobs failed (last $RecentMinutes min) = 0"
  }
} catch {
  Write-Check -Level WARN -Message "Failed to query sync_jobs: $($_.Exception.Message)"
}

Write-Host ""

# 3b) Optional: kick worker once and re-check throughput
if ($KickWorker) {
  try {
    $workerUri = "$($SupabaseUrl.TrimEnd('/'))/functions/v1/sync-worker"
    $workerResp = Invoke-Json -Method POST -Uri $workerUri -Headers $headers -Body '{}'
    Write-Check -Level PASS -Message "Invoked sync-worker once (KickWorker)"

    try {
      if ($null -eq $workerResp) {
        Write-Host "sync-worker response: <null>"
      } elseif ($workerResp -is [string]) {
        Write-Host "sync-worker response: $workerResp"
      } else {
        # PSCustomObject / array / hashtable
        $hasSuccess = $workerResp.PSObject -and ($workerResp.PSObject.Properties.Name -contains 'success')
        $hasError = $workerResp.PSObject -and ($workerResp.PSObject.Properties.Name -contains 'error')
        if ($hasSuccess -and ($workerResp.success -eq $false) -and $hasError -and $workerResp.error) {
          Write-Check -Level WARN -Message "sync-worker returned error: $($workerResp.error)"
        }
        $workerSummary = $workerResp | ConvertTo-Json -Depth 10 -Compress
        Write-Host "sync-worker response: $workerSummary"
      }
    } catch {
      Write-Check -Level WARN -Message "Failed to print sync-worker response: $($_.Exception.Message)"
    }

    if ($KickWorkerWaitSeconds -gt 0) {
      Start-Sleep -Seconds $KickWorkerWaitSeconds
    }

    $sinceIso2 = (Get-Date).ToUniversalTime().AddMinutes(-1 * $RecentMinutes).ToString('o')
    $sinceEnc2 = [System.Uri]::EscapeDataString($sinceIso2)
    $col = $completionCol
    if ($script:SyncCompletionCol) { $col = $script:SyncCompletionCol }

    $completedRecent2 = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'sync_jobs' -FilterQuery ("status=eq.completed&" + $col + "=gt." + $sinceEnc2)
    $pending2 = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'sync_jobs' -FilterQuery 'status=eq.pending'
    $inProgress2 = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'sync_jobs' -FilterQuery 'status=in.(in_progress,running)'

    if ($null -ne $completedRecent2) {
      Write-Check -Level PASS -Message "sync_jobs completed (last $RecentMinutes min) after KickWorker = $completedRecent2"
      if ($null -ne $script:CompletedRecentBeforeKick) {
        $delta = [int]$completedRecent2 - [int]$script:CompletedRecentBeforeKick
        Write-Check -Level PASS -Message "completed delta after KickWorker = $delta"
      }
    } else {
      Write-Check -Level WARN -Message "Unable to re-check completed throughput after KickWorker (count returned null)"
    }

    if ($null -ne $pending2) { Write-Check -Level PASS -Message "sync_jobs pending after KickWorker = $pending2" }
    if ($null -ne $inProgress2) { Write-Check -Level PASS -Message "sync_jobs in_progress/running after KickWorker = $inProgress2" }
  } catch {
    Write-Check -Level WARN -Message "KickWorker failed: $($_.Exception.Message)"
  }
}

Write-Host ""

# 4) Post linkage health
try {
  $unlinked = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'posts' -FilterQuery 'trader_id=is.null&etoro_username=not.is.null'
  $linked = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'posts' -FilterQuery 'trader_id=not.is.null'

  if ($null -ne $linked) { Write-Check -Level PASS -Message "posts linked to trader_id = $linked" }
  if ($null -ne $unlinked) {
    if ($unlinked -gt 0) {
      Write-Check -Level WARN -Message "posts missing trader_id but have etoro_username = $unlinked (run fix-posts backfill: scripts/run-backfill-post-links.ps1)"
    } else {
      Write-Check -Level PASS -Message "posts missing trader_id but have etoro_username = 0"
    }
  }
} catch {
  Write-Check -Level WARN -Message "Failed to query posts linkage: $($_.Exception.Message)"
}

Write-Host ""

# 5) Asset enrichment + price history coverage
try {
  $unknownSector = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'assets' -FilterQuery "sector=is.null"
  $unknownLiteral = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'assets' -FilterQuery "sector=eq.Unknown"

  if ($null -ne $unknownSector) { Write-Check -Level PASS -Message "assets sector IS NULL = $unknownSector" }
  if ($null -ne $unknownLiteral) { Write-Check -Level PASS -Message "assets sector = 'Unknown' = $unknownLiteral" }
} catch {
  Write-Check -Level WARN -Message "Failed to query asset sector status: $($_.Exception.Message)"
}

try {
  $fiveYearsAgo = (Get-Date).ToUniversalTime().AddYears(-5).ToString('yyyy-MM-dd')
  $fiveYearsEnc = [System.Uri]::EscapeDataString($fiveYearsAgo)

  $priceHistoryRecent5y = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'price_history' -FilterQuery "date=gte.$fiveYearsEnc"
  if ($null -eq $priceHistoryRecent5y) {
    Write-Check -Level WARN -Message "Could not read price_history count"
  } elseif ($priceHistoryRecent5y -le 0) {
    Write-Check -Level WARN -Message "price_history has 0 rows in last 5 years"
  } else {
    Write-Check -Level PASS -Message "price_history rows in last 5 years = $priceHistoryRecent5y"
  }
} catch {
  Write-Check -Level WARN -Message "Failed to query price_history: $($_.Exception.Message)"
}

Write-Host ""

# 6) Daily movers today (can be 0 on weekends/holidays)
try {
  # Daily pipeline health: fetch-daily-prices writes to assets (current_price/price_change_pct) and scrape-daily-movers
  # derives daily_movers from those fields.
  $sinceIso = (Get-Date).ToUniversalTime().AddMinutes(-1 * $RecentMinutes).ToString('o')
  $sinceEnc = [System.Uri]::EscapeDataString($sinceIso)

  $assetsWithPriceChange = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'assets' -FilterQuery 'price_change_pct=not.is.null'
  if ($null -eq $assetsWithPriceChange) {
    Write-Check -Level WARN -Message "Could not read assets with price_change_pct (RLS/key may block counts)"
  } elseif ($assetsWithPriceChange -le 0) {
    Write-Check -Level WARN -Message "assets with price_change_pct != NULL = 0 (run fetch-daily-prices; scrape-daily-movers depends on this)"
  } else {
    Write-Check -Level PASS -Message "assets with price_change_pct != NULL = $assetsWithPriceChange"
  }

  $assetsUpdatedRecently = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'assets' -FilterQuery "updated_at=gt.$sinceEnc"
  if ($null -eq $assetsUpdatedRecently) {
    Write-Check -Level WARN -Message "Could not read assets updated in last $RecentMinutes min"
  } elseif ($assetsUpdatedRecently -le 0) {
    Write-Check -Level WARN -Message "assets updated in last $RecentMinutes min = 0 (cron may not be calling fetch-daily-prices/enrichers)"
  } else {
    Write-Check -Level PASS -Message "assets updated in last $RecentMinutes min = $assetsUpdatedRecently"
  }

  $today = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
  $todayEnc = [System.Uri]::EscapeDataString($today)
  $moversToday = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'daily_movers' -FilterQuery "date=eq.$todayEnc"

  if ($null -eq $moversToday) {
    Write-Check -Level WARN -Message "Could not read daily_movers count for today"
  } elseif ($moversToday -le 0) {
    Write-Check -Level WARN -Message "daily_movers rows for today ($today) = 0 (might be normal on weekends/holidays)"
  } else {
    Write-Check -Level PASS -Message "daily_movers rows for today ($today) = $moversToday"
  }
} catch {
  Write-Check -Level WARN -Message "Failed to query daily_movers: $($_.Exception.Message)"
}

Write-Host ""

# 7) Sample trader coverage (holdings/trades)
try {
  $base = $SupabaseUrl.TrimEnd('/')
  $sampleUri = "$base/rest/v1/traders?select=id,etoro_username,display_name,details_synced_at,updated_at&order=details_synced_at.desc.nullslast&limit=1"
  $sampleResp = Invoke-RestMethod -Method GET -Uri $sampleUri -Headers $headers
  $sample = $null
  if ($sampleResp -is [System.Array] -and $sampleResp.Length -gt 0) {
    $sample = $sampleResp[0]
  }

  if ($null -eq $sample) {
    Write-Check -Level WARN -Message "Could not fetch a sample trader"
  } else {
    Write-Check -Level PASS -Message "Sample trader: $($sample.display_name) (@$($sample.etoro_username))"
    $tid = $sample.id

    $holdings = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'trader_holdings' -FilterQuery ("trader_id=eq." + [System.Uri]::EscapeDataString($tid))
    $trades = Get-PostgrestCount -BaseUrl $SupabaseUrl -Headers $headers -Table 'trades' -FilterQuery ("trader_id=eq." + [System.Uri]::EscapeDataString($tid))

    if ($null -ne $holdings) {
      if ($holdings -gt 0) { Write-Check -Level PASS -Message "Sample trader holdings rows = $holdings" }
      else { Write-Check -Level WARN -Message "Sample trader holdings rows = 0 (may not be synced yet)" }
    }

    if ($null -ne $trades) {
      if ($trades -gt 0) { Write-Check -Level PASS -Message "Sample trader trades rows = $trades" }
      else { Write-Check -Level WARN -Message "Sample trader trades rows = 0 (may not be synced yet)" }
    }
  }
} catch {
  Write-Check -Level WARN -Message "Failed sample trader checks: $($_.Exception.Message)"
}

Write-Host ""

if ($failed) {
  Write-Host "Smoke validation: FAILED" -ForegroundColor Red
  exit 1
}

Write-Host "Smoke validation: OK (see WARN items above if any)" -ForegroundColor Green
exit 0
