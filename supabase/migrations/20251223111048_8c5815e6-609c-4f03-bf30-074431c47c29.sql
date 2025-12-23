-- Create sync_state table to track continuous sync progress
CREATE TABLE public.sync_state (
  id TEXT PRIMARY KEY,
  last_run TIMESTAMPTZ,
  last_page INTEGER DEFAULT 1,
  total_pages INTEGER,
  status TEXT DEFAULT 'idle',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view sync state (for admin dashboard)
CREATE POLICY "Anyone can view sync_state" ON public.sync_state FOR SELECT USING (true);

-- Allow service role to manage sync state (edge functions use service role)
CREATE POLICY "Service can manage sync_state" ON public.sync_state FOR ALL USING (true);

-- Insert initial sync states
INSERT INTO public.sync_state (id, last_run, last_page, status) VALUES
  ('traders', NULL, 1, 'idle'),
  ('trader_details', NULL, 1, 'idle'),
  ('assets', NULL, 1, 'idle');

-- Add updated_at trigger
CREATE TRIGGER update_sync_state_updated_at
  BEFORE UPDATE ON public.sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();