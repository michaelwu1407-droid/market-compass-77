-- Drop the partial unique index (doesn't work with upsert)
DROP INDEX IF EXISTS idx_trades_position_id_unique;

-- Create a regular unique constraint without WHERE clause
-- NULL values won't conflict with each other in PostgreSQL
ALTER TABLE public.trades ADD CONSTRAINT trades_position_id_unique UNIQUE (position_id);