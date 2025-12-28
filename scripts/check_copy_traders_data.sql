-- Quick check: why a trader profile looks empty
-- Replace the UUID literal and re-run.

-- 1) Trader row
select id, username, etoro_username, display_name, details_synced_at
from traders
where id = 'PUT-REAL-UUID-HERE';

-- 2) Holdings count
select count(*) as holdings_rows
from trader_holdings
where trader_id = 'PUT-REAL-UUID-HERE';

-- 3) Recent jobs for this trader
select status, job_type, count(*) as n,
       max(coalesce(finished_at, started_at, created_at)) as last_activity
from sync_jobs
where trader_id = 'PUT-REAL-UUID-HERE'
group by status, job_type
order by status, job_type;

-- 4) Recent failures (if any)
select id, status, job_type, retry_count, error_message,
       created_at, started_at, finished_at
from sync_jobs
where trader_id = 'PUT-REAL-UUID-HERE'
  and status = 'failed'
order by coalesce(finished_at, started_at, created_at) desc
limit 20;
