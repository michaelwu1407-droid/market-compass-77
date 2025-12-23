-- Add currency column to assets table for international stocks
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';