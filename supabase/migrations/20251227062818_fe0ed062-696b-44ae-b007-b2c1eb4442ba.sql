-- Part 1: Create sync_jobs table for trader sync queue
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  result JSONB
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON sync_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_trader_id ON sync_jobs(trader_id);

ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_jobs' AND policyname = 'Anyone can view sync_jobs'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can view sync_jobs" ON public.sync_jobs FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_jobs' AND policyname = 'Service can manage sync_jobs'
  ) THEN
    EXECUTE 'CREATE POLICY "Service can manage sync_jobs" ON public.sync_jobs FOR ALL USING (true)';
  END IF;
END $$;

-- Part 2: Add unique constraint to sync_datapoints to prevent duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_datapoints_run_key_unique' AND conrelid = 'public.sync_datapoints'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE public.sync_datapoints ADD CONSTRAINT sync_datapoints_run_key_unique UNIQUE (run_id, datapoint_key)';
  END IF;
END $$;

-- Part 3: Add etoro_username to posts for unknown trader posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS etoro_username TEXT;
CREATE INDEX IF NOT EXISTS idx_posts_etoro_username ON posts(etoro_username);