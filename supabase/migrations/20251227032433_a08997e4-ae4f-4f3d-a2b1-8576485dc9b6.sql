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

-- Allow anyone to view
CREATE POLICY "Anyone can view sync_datapoints" ON public.sync_datapoints
  FOR SELECT USING (true);

-- Allow service to manage
CREATE POLICY "Service can manage sync_datapoints" ON public.sync_datapoints
  FOR ALL USING (true);

-- Add index for fast lookup
CREATE INDEX idx_sync_datapoints_domain_run ON public.sync_datapoints(domain, run_id);
CREATE INDEX idx_sync_datapoints_created_at ON public.sync_datapoints(created_at DESC);

-- Create updated_at trigger
CREATE TRIGGER update_sync_datapoints_updated_at
  BEFORE UPDATE ON public.sync_datapoints
  FOR EACH ROW EXECUTE FUNCTION public.update_sync_updated_at();

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