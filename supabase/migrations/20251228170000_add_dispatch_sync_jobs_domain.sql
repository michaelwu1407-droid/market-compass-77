-- Allow dispatch-sync-jobs to use the shared sync_domain_status lock table
-- Guardrails only: adds a new domain value and initializes its row.

DO $$
BEGIN
  -- Expand the domain check constraint to include dispatch_sync_jobs.
  -- (Constraint name can vary depending on how it was created; handle the common one.)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sync_domain_status'::regclass
      AND contype = 'c'
      AND conname = 'sync_domain_status_domain_check'
  ) THEN
    EXECUTE 'ALTER TABLE public.sync_domain_status DROP CONSTRAINT sync_domain_status_domain_check';
  END IF;

  -- Recreate with the extended allowed set.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sync_domain_status'::regclass
      AND contype = 'c'
      AND conname = 'sync_domain_status_domain_check'
  ) THEN
    EXECUTE $$
      ALTER TABLE public.sync_domain_status
      ADD CONSTRAINT sync_domain_status_domain_check
      CHECK (domain IN ('discussion_feed', 'trader_profiles', 'stock_data', 'dispatch_sync_jobs'))
    $$;
  END IF;

  -- Ensure the status row exists.
  INSERT INTO public.sync_domain_status (domain, status)
  VALUES ('dispatch_sync_jobs', 'idle')
  ON CONFLICT (domain) DO NOTHING;
END $$;
