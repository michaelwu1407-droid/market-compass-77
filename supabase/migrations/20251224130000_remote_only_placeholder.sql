-- Placeholder migration to match remote migration history.
--
-- The remote project has migration version 20251224130000 recorded as applied,
-- but this repository did not contain the corresponding file.
--
-- This file is intentionally a no-op so `supabase db push/pull` can reconcile
-- local and remote histories.
select 1;
