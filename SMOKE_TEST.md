# Smoke Test (Production Validation)

This repo includes a lightweight smoke test that you can run locally against your deployed Supabase project to confirm:
- Edge Functions are reachable
- Core tables are populated
- Sync is producing jobs and completing some
- Posts are being linked to traders
- Asset enrichment / price history tables are populated

## Prerequisites

You need your project URL and a Supabase key.

Recommended (best signal): use the **Service Role Key** so the script can read counts even if RLS blocks anon access.

## Run

PowerShell (Windows):

### Option A (recommended if your terminal won't let you paste keys)

1. Create this file:
   - `secrets/supabase_service_role_key.txt`
2. Paste your **service_role** key into that file (single line) and save.
3. Run:
    - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-smoke-with-keyfile.ps1`


Optional flags:
- Kick the worker once and re-check throughput:
   - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke-validate.ps1 -KickWorker`

If `sync_jobs pending` is huge and `completed` stays 0, run:
   - `scripts/snapshot_sync_jobs_stuck.sql`

### Handy runners (no long inline PowerShell)

- Trigger daily price refresh now:
   - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-fetch-daily-prices.ps1 -ProjectRef <YOUR_PROJECT_REF>`

- Backfill post -> trader links (reduces "posts missing trader_id" WARN):
   - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-backfill-post-links.ps1 -ProjectRef <YOUR_PROJECT_REF> -Limit 200 -MaxPages 10`

- Enrich asset sectors/fundamentals (reduces "assets sector IS NULL" WARN):
   - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-enrich-assets-yahoo.ps1 -ProjectRef <YOUR_PROJECT_REF>`
This avoids pasting long keys into the terminal.

### Option B (env vars)

1. Set environment variables (current session):

   - `SUPABASE_URL` (example: `https://<project-ref>.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` (recommended)

2. Run the script:

   - `powershell -ExecutionPolicy Bypass -File scripts\smoke-validate.ps1`

Optional:
- To use anon instead, set `SUPABASE_ANON_KEY` and omit `SUPABASE_SERVICE_ROLE_KEY`.
- Adjust the recent window used for sync checks:
  - `powershell -ExecutionPolicy Bypass -File scripts\smoke-validate.ps1 -RecentMinutes 60`

## How to interpret results

- **PASS**: expected and healthy.
- **WARN**: not necessarily broken (often means data not yet synced, weekend/holiday, or rate limits), but worth checking logs.
- **FAIL**: connectivity or a core invariant is broken (functions not reachable, traders count is 0, etc.).

If you see WARN/FAIL items, cross-check with:
- CHECK_LOGS.md (Supabase Edge Function logs)
- scripts/verify_auto_trader_sync.sql (job throughput)
- scripts/snapshot_* SQL health snapshots

## Deployment Sanity (GitHub Actions)

If you deploy via GitHub Actions, the workflow is: **Deploy Supabase Functions** (see `.github/workflows/deploy.yml`).

What to check:
- GitHub → Actions → **Deploy Supabase Functions**: latest run is green after your last push
- Repo secrets exist (GitHub → Settings → Secrets and variables → Actions):
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_DB_PASSWORD`

Quick “is the new code deployed?” probe (recommended after any deploy):
- Call `verify-deployment` (returns a JSON bundle of checks)

PowerShell example:

- `Invoke-RestMethod -Method Post -Uri "$env:SUPABASE_URL/functions/v1/verify-deployment" -Headers @{"Content-Type"="application/json"} -Body '{}'`

Note: This works without an Authorization header only if the function is configured public (see next section).

## Automation Sanity (Cron / Worker)

This repo supports **external cron** (recommended) and/or Supabase Scheduled Functions.

### A) External cron (recommended)

Follow: `SETUP_EXTERNAL_CRON.md`

The expected schedules (also mirrored in `supabase/cron.yaml`):
- `sync-worker`: every 2 minutes
- `enrich-assets-yahoo`: every 15 minutes
- `backfill-asset-history`: `7,22,37,52 * * * *`
- `fix-posts (backfill links)`: every 10 minutes

Validation method (no dashboards required):
- Run the smoke script twice ~10 minutes apart.
- Confirm `sync_jobs`:
   - `completed (last N minutes)` is increasing
   - `pending` is stable or decreasing

### B) Supabase Scheduled Functions / Auth settings

If you call functions from an external cron service **without** auth headers, the functions must be public:

- Verify in `supabase/config.toml` that these are present with `verify_jwt = false`:
   - `sync-worker`
   - `enrich-assets-yahoo`
   - `backfill-asset-history`
   - `fix-posts` (called with `?only_missing_trader_id=true`)

If any of those are missing, cron will silently fail with `401 Unauthorized`.

### C) GitHub Actions (manual triggers)

Two workflows exist primarily for manual debugging:
- **Sync Worker - Continuous Processing** (`.github/workflows/sync-worker.yml`)
- **Discover New Traders - Continuous** (`.github/workflows/discover-traders.yml`)

These do not run on a schedule by default; they’re meant for quick “does the endpoint respond?” checks.

## Common failure signatures

- `404 Not Found` calling `/functions/v1/<name>`: function not deployed (or wrong project URL)
- `401 Unauthorized`: function is not public (`verify_jwt` not disabled) or you’re sending the wrong auth
- `traders count = 0`: discovery is not running or inserts are failing (check Edge logs)
- `price_history last 5 years = 0`: asset history backfill not running yet (or upstream/provider failures)
