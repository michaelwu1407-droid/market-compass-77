# Trader profile data sync issues

Date: Dec 2025 (last updated Dec 28, 2025)

## Goal
Have trader profile data reliably sync and populate the Trader Detail page (holdings, performance/metrics fields, etc.) from BullAware into the external Supabase project (`xgvaibxxiwfraklfbwey`).

## Symptoms
- Admin Sync → **Trader Profiles** shows “0 jobs pending” / “Processed 0 trader jobs”.
- Trader pages show stale/empty data (especially holdings).

## Root causes we addressed
1) **Job queue wasn’t being filled**
- `trigger-sync` for `trader_profiles` only dispatched jobs from `sync_jobs`. If the queue was empty, it effectively did nothing.

2) **`sync_jobs` schema drift across environments**
- The repo had multiple historical `sync_jobs` definitions (UUID id vs BIGINT identity; `finished_at` vs `completed_at`; sometimes missing `job_type`).
- Edge Functions assume a UUID job queue and use fields like `started_at`, `finished_at`, `retry_count`, `error_message`, and `job_type`.

3) **Holdings writes didn’t match the DB schema**
- `trader_holdings` table schema requires `asset_id` (UUID), but older code attempted to insert a `symbol` field. That insert cannot succeed.

## What we changed
### Migrations (schema-only path)
- Normalizes `public.sync_jobs` into a single compatible schema (UUID id + required columns + indexes + RLS policies), even if the table already exists in a conflicting shape.
  - Migration: supabase/migrations/20251228130000_normalize_sync_jobs_to_uuid.sql

### Edge Functions (runtime behavior)
- `trigger-sync` now enqueues jobs when the queue is empty, then dispatches.
- `enqueue-sync-jobs` now creates “one job = one BullAware request” using job types:
  - `investor_details`, `risk_score`, `metrics`, `portfolio`
- `process-sync-job` now passes `job_type` into `sync-trader-details`.
- `sync-trader-details` now performs exactly **one BullAware endpoint call per job** and writes holdings using `asset_id` (symbol → assets lookup).

## Verification SQL (run in Supabase SQL Editor)
Use this to confirm the external DB matches what the code expects.

### 1) Confirm `sync_jobs` schema + key columns
```sql
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sync_jobs'
order by ordinal_position;
```

Expected (high level):
- `id` is UUID (udt_name = `uuid`)
- `trader_id` UUID
- `status` text
- `job_type` text (NOT NULL, default `portfolio`)
- `created_at` timestamptz
- `started_at` timestamptz nullable
- `finished_at` timestamptz nullable
- `retry_count` int
- `error_message` text
- `result` jsonb

### 2) Confirm `sync_jobs` indexes
```sql
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'sync_jobs'
order by indexname;
```

### 3) Confirm RLS + policies exist
```sql
-- RLS enabled?
select relname, relrowsecurity
from pg_class
where relname = 'sync_jobs';

-- Policies
select
  polname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'sync_jobs'
order by polname;
```

Expected policies:
- `Anyone can view sync_jobs` (SELECT)
- `Service can manage sync_jobs` (ALL)

### 4) Confirm the holdings schema is `asset_id` based
```sql
select
  column_name,
  data_type,
  udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trader_holdings'
order by ordinal_position;
```

### 5) Quick “is the queue alive?” checks
```sql
-- How many traders exist?
select count(*) as traders_total from public.traders;

-- Jobs by status
select status, count(*)
from public.sync_jobs
group by status
order by count(*) desc;

-- Sample pending jobs
select id, trader_id, job_type, status, created_at
from public.sync_jobs
where status = 'pending'
order by created_at asc
limit 20;
```

### 6) After running sync, confirm holdings show up
```sql
select
  th.trader_id,
  count(*) as holdings_rows,
  max(th.updated_at) as last_holdings_update
from public.trader_holdings th
group by th.trader_id
order by last_holdings_update desc
limit 20;
```

## Deploy checklist (external project)
After pulling latest `main`:

1) Apply migrations to `xgvaibxxiwfraklfbwey` (choose one)
- Supabase CLI: `supabase db push --project-ref xgvaibxxiwfraklfbwey`
- OR copy/paste the migration SQL into Supabase SQL Editor

2) Deploy the updated Edge Functions:
- `supabase functions deploy trigger-sync --project-ref xgvaibxxiwfraklfbwey`
- `supabase functions deploy enqueue-sync-jobs --project-ref xgvaibxxiwfraklfbwey`
- `supabase functions deploy dispatch-sync-jobs --project-ref xgvaibxxiwfraklfbwey`
- `supabase functions deploy process-sync-job --project-ref xgvaibxxiwfraklfbwey`
- `supabase functions deploy sync-trader-details --project-ref xgvaibxxiwfraklfbwey`

3) Trigger sync
- From Admin Sync page: run `Trader Profiles`
- Or invoke `trigger-sync` with `{ "domains": ["trader_profiles"] }`

## Notes / expectations
- BullAware is rate-limited (10 req/min). The queue is intentionally granular (1 endpoint per job) so processing can be throttled safely.
- If holdings stay empty, the most common reason is missing assets for the symbols returned by BullAware. In that case, run the stock/asset sync first so `assets.symbol` exists.
