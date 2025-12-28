-- NOTE:
-- This repo originally attempted to manage `pg_cron` schedules via migrations by
-- directly writing to `cron.job` and embedding auth tokens.
--
-- In managed Supabase projects, migration roles commonly *cannot* modify `cron.job`,
-- and embedding secrets in migrations is not acceptable.
--
-- Cron scheduling for production should be managed via:
-- - Supabase Scheduled Functions / `supabase/cron.yaml`, or
-- - an external cron runner (see docs in this repo).
--
-- Keeping this migration as a no-op ensures `supabase db push` can proceed.
select 1;

