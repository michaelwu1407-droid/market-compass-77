-- Ensure sync_jobs schema matches edge function expectations
-- This is written to be safe on existing projects (uses IF NOT EXISTS).

DO $$
BEGIN
  -- Add columns used by the job-based trader profile sync
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'job_type'
  ) THEN
    ALTER TABLE public.sync_jobs ADD COLUMN job_type TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.sync_jobs ADD COLUMN started_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'finished_at'
  ) THEN
    ALTER TABLE public.sync_jobs ADD COLUMN finished_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.sync_jobs ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE public.sync_jobs ADD COLUMN error_message TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_jobs' AND column_name = 'result'
  ) THEN
    ALTER TABLE public.sync_jobs ADD COLUMN result JSONB;
  END IF;

  -- Default job_type for older rows
  UPDATE public.sync_jobs SET job_type = 'portfolio' WHERE job_type IS NULL;

  -- If job_type column exists, make it required going forward
  BEGIN
    ALTER TABLE public.sync_jobs ALTER COLUMN job_type SET DEFAULT 'portfolio';
    ALTER TABLE public.sync_jobs ALTER COLUMN job_type SET NOT NULL;
  EXCEPTION WHEN others THEN
    -- If the project has a different schema (e.g. job_type already exists with constraints), ignore.
    NULL;
  END;

  -- Helpful indexes
  CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON public.sync_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON public.sync_jobs(created_at);
  CREATE INDEX IF NOT EXISTS idx_sync_jobs_trader_id ON public.sync_jobs(trader_id);
  CREATE INDEX IF NOT EXISTS idx_sync_jobs_job_type ON public.sync_jobs(job_type);

END $$;
