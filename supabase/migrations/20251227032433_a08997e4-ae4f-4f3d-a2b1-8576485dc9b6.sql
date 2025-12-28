-- Create sync_datapoints table for granular metric tracking
CREATE TABLE IF NOT EXISTS public.sync_datapoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  domain text NOT NULL,
  datapoint_key text NOT NULL,
  datapoint_label text NOT NULL,
  value_current integer DEFAULT 0,
  value_total integer,
  status text DEFAULT 'pending',
  details jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_datapoints ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_datapoints' AND policyname = 'Anyone can view sync_datapoints'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can view sync_datapoints" ON public.sync_datapoints FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_datapoints' AND policyname = 'Service can manage sync_datapoints'
  ) THEN
    EXECUTE 'CREATE POLICY "Service can manage sync_datapoints" ON public.sync_datapoints FOR ALL USING (true)';
  END IF;
END $$;

-- Add index for fast lookup
CREATE INDEX IF NOT EXISTS idx_sync_datapoints_domain_run ON public.sync_datapoints(domain, run_id);
CREATE INDEX IF NOT EXISTS idx_sync_datapoints_created_at ON public.sync_datapoints(created_at DESC);

-- Create updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_sync_datapoints_updated_at' AND tgrelid = 'public.sync_datapoints'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER update_sync_datapoints_updated_at BEFORE UPDATE ON public.sync_datapoints FOR EACH ROW EXECUTE FUNCTION public.update_sync_updated_at()';
  END IF;
END $$;

-- Add increment function for atomic rate limit updates
CREATE OR REPLACE FUNCTION public.increment_rate_limit(limit_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE sync_rate_limits 
  SET requests_this_minute = requests_this_minute + 1,
      updated_at = now()
  WHERE id = limit_id;
END;
$$;