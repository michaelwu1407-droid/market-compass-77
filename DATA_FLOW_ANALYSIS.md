# Data Flow Analysis & Root Cause Investigation

## Data Points Being Synced

### From Bullaware API (10 req/min limit):

1. **`sync-traders`** - Fetches trader list:
   - `etoro_username`
   - `display_name`
   - `risk_score`
   - `copiers`
   - `gain_12m`
   - **Endpoint**: `https://api.bullaware.com/v1/investors?limit=1000&offset=X`
   - **Max**: 10,000 traders per call (10 pages × 1000)

2. **`sync-trader-details`** - Fetches portfolio/holdings:
   - Portfolio holdings (symbols, allocation_pct, profit_loss_pct)
   - **Endpoint**: `https://api.bullaware.com/v1/investors/{username}/portfolio`

3. **`process-queue`** (if used) - Fetches detailed metrics:
   - `profitable_weeks_pct`, `profitable_months_pct`
   - `daily_drawdown`, `weekly_drawdown`
   - `sharpe_ratio`, `sortino_ratio`, `alpha`, `beta`
   - Risk score history

### NOT from Bullaware API:

4. **`scrape-posts`** - Discussion feed:
   - **Source**: eToro API directly (`https://www.etoro.com/api/edm-streams/v1/feed/popularInvestors`)
   - **Confirmed**: Bullaware API does NOT provide discussion feed

## Current Problem: Stuck at 130 Traders

### Possible Root Causes:

1. **`sync-traders` only fetching 130 traders from Bullaware**
   - Bullaware API might only return 130 traders total
   - Or pagination is stopping early
   - Or API is rate-limited/erroring

2. **`discover-traders` workflow not running**
   - GitHub Actions might not be executing
   - Or workflow is failing silently

3. **Functions not deployed**
   - `deploy.yml` might not be running
   - Or deployment is failing

4. **Database constraint**
   - Some limit preventing more traders from being inserted

## Automated Flow (Should Be):

1. **Discovery** (every 6 hours):
   - `discover-traders.yml` → calls `enqueue-sync-jobs` with `{"sync_traders": true}`
   - `enqueue-sync-jobs` → calls `sync-traders`
   - `sync-traders` → fetches up to 10,000 traders from Bullaware
   - `enqueue-sync-jobs` → creates jobs for all traders

2. **Processing** (every 2 minutes):
   - `sync-worker.yml` → calls `sync-worker`
   - `sync-worker` → calls `dispatch-sync-jobs`
   - `dispatch-sync-jobs` → processes 10 jobs sequentially (7s delay = ~8.5 req/min)
   - `process-sync-job` → calls `sync-trader-details` for each trader
   - `sync-trader-details` → fetches portfolio from Bullaware

3. **Queue Refill** (when pending < 200):
   - `sync-worker` → calls `enqueue-sync-jobs` with `{}` (nuclear mode)
   - `enqueue-sync-jobs` → creates jobs for ALL traders in database

## Investigation Checklist:

- [ ] Check GitHub Actions: Are workflows running?
- [ ] Check Supabase logs: Are functions being invoked?
- [ ] Check Bullaware API: How many traders does it actually return?
- [ ] Check database: How many traders are actually in the database?
- [ ] Check sync_jobs: Are jobs being created and processed?

