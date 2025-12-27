-- Create sync_runs table for per-domain run tracking
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('discussion_feed', 'trader_profiles', 'stock_data')),
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'queued', 'completed', 'error', 'rate_limited')),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  items_total integer DEFAULT 0,
  items_completed integer DEFAULT 0,
  current_stage text,
  error_message text,
  error_details jsonb,
  triggered_by text DEFAULT 'auto' CHECK (triggered_by IN ('auto', 'manual', 'cron')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create sync_domain_status table for current domain state (one row per domain)
CREATE TABLE IF NOT EXISTS public.sync_domain_status (
  domain text PRIMARY KEY CHECK (domain IN ('discussion_feed', 'trader_profiles', 'stock_data')),
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'queued', 'error', 'rate_limited')),
  current_run_id uuid REFERENCES public.sync_runs(id),
  last_successful_run_id uuid REFERENCES public.sync_runs(id),
  last_successful_at timestamp with time zone,
  next_scheduled_at timestamp with time zone,
  items_total integer DEFAULT 0,
  items_completed integer DEFAULT 0,
  current_stage text,
  eta_seconds integer,
  last_error_message text,
  last_error_at timestamp with time zone,
  lock_holder text,
  lock_acquired_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create sync_rate_limits table for BullAware rate limit tracking
CREATE TABLE IF NOT EXISTS public.sync_rate_limits (
  id text PRIMARY KEY DEFAULT 'bullaware',
  requests_this_minute integer DEFAULT 0,
  minute_started_at timestamp with time zone DEFAULT now(),
  max_per_minute integer DEFAULT 10,
  next_reset_at timestamp with time zone,
  total_requests_today integer DEFAULT 0,
  day_started_at date DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create sync_logs table for detailed logging
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.sync_runs(id),
  domain text NOT NULL,
  level text DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message text NOT NULL,
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Insert initial domain status rows
INSERT INTO public.sync_domain_status (domain, status) VALUES 
  ('discussion_feed', 'idle'),
  ('trader_profiles', 'idle'),
  ('stock_data', 'idle')
ON CONFLICT (domain) DO NOTHING;

-- Insert initial rate limit row for BullAware
INSERT INTO public.sync_rate_limits (id, max_per_minute) VALUES ('bullaware', 10)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_domain_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Create read policies (anyone can view sync status)
CREATE POLICY "Anyone can view sync_runs" ON public.sync_runs FOR SELECT USING (true);
CREATE POLICY "Anyone can view sync_domain_status" ON public.sync_domain_status FOR SELECT USING (true);
CREATE POLICY "Anyone can view sync_rate_limits" ON public.sync_rate_limits FOR SELECT USING (true);
CREATE POLICY "Anyone can view sync_logs" ON public.sync_logs FOR SELECT USING (true);

-- Create write policies (service role only via edge functions)
CREATE POLICY "Service can manage sync_runs" ON public.sync_runs FOR ALL USING (true);
CREATE POLICY "Service can manage sync_domain_status" ON public.sync_domain_status FOR ALL USING (true);
CREATE POLICY "Service can manage sync_rate_limits" ON public.sync_rate_limits FOR ALL USING (true);
CREATE POLICY "Service can manage sync_logs" ON public.sync_logs FOR ALL USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_runs_domain_status ON public.sync_runs(domain, status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_created_at ON public.sync_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_run_id ON public.sync_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_domain_created ON public.sync_logs(domain, created_at DESC);

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION public.update_sync_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_sync_runs_updated_at
  BEFORE UPDATE ON public.sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_sync_updated_at();

CREATE TRIGGER update_sync_domain_status_updated_at
  BEFORE UPDATE ON public.sync_domain_status
  FOR EACH ROW EXECUTE FUNCTION public.update_sync_updated_at();

CREATE TRIGGER update_sync_rate_limits_updated_at
  BEFORE UPDATE ON public.sync_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_sync_updated_at();