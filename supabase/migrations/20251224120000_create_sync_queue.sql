-- Create sync_queue table
CREATE TABLE public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id TEXT NOT NULL UNIQUE, -- eToro username
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  last_attempted_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- Create policies (admin/service role only for simplicity for now, or public if needed for admin panel)
CREATE POLICY "Anyone can view sync_queue" ON public.sync_queue FOR SELECT USING (true);
CREATE POLICY "Service can manage sync_queue" ON public.sync_queue FOR ALL USING (true);

-- Create index on status for faster fetching
CREATE INDEX idx_sync_queue_status ON public.sync_queue(status);

-- Add updated_at trigger
CREATE TRIGGER update_sync_queue_updated_at
  BEFORE UPDATE ON public.sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
