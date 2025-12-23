-- Add instrument_id column to assets table for eToro instrument ID mapping
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS instrument_id integer;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_assets_instrument_id ON public.assets(instrument_id) WHERE instrument_id IS NOT NULL;