-- Create data_discrepancies table for logging cross-check differences
CREATE TABLE public.data_discrepancies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trader', 'asset', 'holding')),
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  bullaware_value TEXT,
  firecrawl_value TEXT,
  difference_pct NUMERIC,
  value_used TEXT NOT NULL DEFAULT 'bullaware',
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'reviewed', 'dismissed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.data_discrepancies ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view discrepancies (internal tool)
CREATE POLICY "Anyone can view data_discrepancies"
ON public.data_discrepancies
FOR SELECT
USING (true);

-- Allow anyone to insert discrepancies (from edge functions)
CREATE POLICY "Anyone can insert data_discrepancies"
ON public.data_discrepancies
FOR INSERT
WITH CHECK (true);

-- Allow anyone to update discrepancies (for review workflow)
CREATE POLICY "Anyone can update data_discrepancies"
ON public.data_discrepancies
FOR UPDATE
USING (true);

-- Create index for common queries
CREATE INDEX idx_discrepancies_status ON public.data_discrepancies(status);
CREATE INDEX idx_discrepancies_entity ON public.data_discrepancies(entity_type, entity_id);
CREATE INDEX idx_discrepancies_created ON public.data_discrepancies(created_at DESC);