-- Legacy migration note:
--
-- A previous version of this repo included an 8-digit migration (20251227_...) that
-- performed a TRUNCATE-based dedupe of `sync_datapoints`. That is not safe to
-- re-run and also caused Supabase CLI migration history mismatches.
--
-- The actual, safe changes (additive columns + optional uniqueness enforcement)
-- are handled by later, non-destructive migrations.
select 1;
