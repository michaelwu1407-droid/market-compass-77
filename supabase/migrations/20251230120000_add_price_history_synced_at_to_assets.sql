ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS price_history_synced_at TIMESTAMPTZ;
