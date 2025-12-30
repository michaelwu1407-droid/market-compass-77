-- Add return metrics columns to traders table
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS return_1m numeric,
ADD COLUMN IF NOT EXISTS return_ytd numeric,
ADD COLUMN IF NOT EXISTS return_5y numeric;
