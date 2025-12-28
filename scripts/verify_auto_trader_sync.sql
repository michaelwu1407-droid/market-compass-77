-- Verification queries for automatic trader sync
-- Run these twice ~10 minutes apart (with NO manual dispatch) and confirm pending decreases.

select
  now() as ts,
  count(*) as pending_jobs
from public.sync_jobs
where status = 'pending';

select
  now() as ts,
  count(*) as failed_last_30m
from public.sync_jobs
where status = 'failed'
  and created_at > now() - interval '30 minutes';

-- Optional: recent completed throughput
select
  date_trunc('minute', completed_at) as minute,
  count(*) as completed
from public.sync_jobs
where status = 'completed'
  and completed_at > now() - interval '30 minutes'
group by 1
order by 1 desc;
