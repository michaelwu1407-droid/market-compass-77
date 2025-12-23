-- Add column to track when trader details (holdings, trades, performance) were last synced
-- This is separate from updated_at which tracks when basic trader info was synced
ALTER TABLE public.traders 
ADD COLUMN IF NOT EXISTS details_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;