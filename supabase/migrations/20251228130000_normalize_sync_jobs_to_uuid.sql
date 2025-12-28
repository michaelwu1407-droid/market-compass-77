-- Normalize sync_jobs to a single, code-compatible schema.
--
-- Why:
-- This repo accumulated multiple competing sync_jobs definitions (BIGINT id vs UUID id,
-- finished_at vs completed_at, missing job_type, etc). The edge functions expect:
-- - id UUID
-- - trader_id UUID
-- - status text
-- - job_type text (one Bullaware call per job)
-- - started_at / finished_at timestamps
--
-- This migration rebuilds sync_jobs if the existing schema is incompatible.

DO $$
DECLARE
  id_udt text;
  has_table boolean;
  has_status boolean;
  has_job_type boolean;
  has_retry_count boolean;
  has_created_at boolean;
  has_started_at boolean;
  has_finished_at boolean;
  has_completed_at boolean;
  has_error_message boolean;
  has_result boolean;
  status_expr text;
  job_type_expr text;
  retry_expr text;
  created_expr text;
  started_expr text;
  finished_expr text;
  error_expr text;
  result_expr text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sync_jobs'
  ) INTO has_table;

  IF NOT has_table THEN
    -- Fresh create
    CREATE TABLE public.sync_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trader_id UUID REFERENCES public.traders(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      job_type TEXT NOT NULL DEFAULT 'portfolio',
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      error_message TEXT,
      result JSONB
    );
  ELSE
    -- Detect current id type
    SELECT c.udt_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'sync_jobs'
       AND c.column_name = 'id'
     LIMIT 1
    INTO id_udt;

    -- If id is not UUID, rebuild the table into the code-compatible shape.
    IF id_udt IS DISTINCT FROM 'uuid' THEN
      CREATE TABLE public.sync_jobs__new (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trader_id UUID REFERENCES public.traders(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        job_type TEXT NOT NULL DEFAULT 'portfolio',
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        error_message TEXT,
        result JSONB
      );

      -- Best-effort copy from whatever legacy shape exists.
      -- We must not reference missing columns directly (e.g., completed_at vs finished_at).
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='status'
      ) INTO has_status;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='job_type'
      ) INTO has_job_type;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='retry_count'
      ) INTO has_retry_count;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='created_at'
      ) INTO has_created_at;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='started_at'
      ) INTO has_started_at;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='finished_at'
      ) INTO has_finished_at;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='completed_at'
      ) INTO has_completed_at;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='error_message'
      ) INTO has_error_message;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_jobs' AND column_name='result'
      ) INTO has_result;

      status_expr := CASE WHEN has_status THEN 'COALESCE(status, ''pending'')::text' ELSE '''pending''::text' END;
      job_type_expr := CASE WHEN has_job_type THEN 'COALESCE(job_type, ''portfolio'')::text' ELSE '''portfolio''::text' END;
      retry_expr := CASE WHEN has_retry_count THEN 'COALESCE(retry_count, 0)::int' ELSE '0::int' END;
      created_expr := CASE WHEN has_created_at THEN 'COALESCE(created_at, now())' ELSE 'now()' END;
      started_expr := CASE WHEN has_started_at THEN 'started_at' ELSE 'NULL::timestamptz' END;
      finished_expr := CASE
        WHEN has_finished_at AND has_completed_at THEN 'COALESCE(finished_at, completed_at)'
        WHEN has_finished_at THEN 'finished_at'
        WHEN has_completed_at THEN 'completed_at'
        ELSE 'NULL::timestamptz'
      END;
      error_expr := CASE WHEN has_error_message THEN 'error_message' ELSE 'NULL::text' END;
      result_expr := CASE WHEN has_result THEN 'result' ELSE 'NULL::jsonb' END;

      EXECUTE format(
        'INSERT INTO public.sync_jobs__new (trader_id, status, job_type, retry_count, created_at, started_at, finished_at, error_message, result) '
        || 'SELECT trader_id, %s, %s, %s, %s, %s, %s, %s, %s FROM public.sync_jobs',
        status_expr,
        job_type_expr,
        retry_expr,
        created_expr,
        started_expr,
        finished_expr,
        error_expr,
        result_expr
      );

      DROP TABLE public.sync_jobs;
      ALTER TABLE public.sync_jobs__new RENAME TO sync_jobs;
    END IF;
  END IF;

  -- Ensure required columns exist (if table already UUID but missing columns)
  ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS job_type TEXT;
  ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
  ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
  ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
  ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
  ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS result JSONB;

  -- Default any missing job_type values
  UPDATE public.sync_jobs SET job_type = 'portfolio' WHERE job_type IS NULL;

  -- Enforce job_type going forward
  BEGIN
    ALTER TABLE public.sync_jobs ALTER COLUMN job_type SET DEFAULT 'portfolio';
    ALTER TABLE public.sync_jobs ALTER COLUMN job_type SET NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON public.sync_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON public.sync_jobs(created_at);
  CREATE INDEX IF NOT EXISTS idx_sync_jobs_trader_id ON public.sync_jobs(trader_id);
  CREATE INDEX IF NOT EXISTS idx_sync_jobs_job_type ON public.sync_jobs(job_type);

  -- RLS (read-only for everyone; service role bypasses RLS)
  BEGIN
    ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  -- Policies (idempotent)
  BEGIN
    CREATE POLICY "Anyone can view sync_jobs" ON public.sync_jobs FOR SELECT USING (true);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    CREATE POLICY "Service can manage sync_jobs" ON public.sync_jobs FOR ALL USING (true) WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
