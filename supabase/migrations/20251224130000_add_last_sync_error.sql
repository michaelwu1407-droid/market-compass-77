-- Add last_sync_error column to traders table to track sync failures
ALTER TABLE public.traders
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
