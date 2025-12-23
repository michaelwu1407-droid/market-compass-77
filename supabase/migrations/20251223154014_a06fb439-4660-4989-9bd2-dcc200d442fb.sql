-- Drop the partial unique index (doesn't work with upsert)
DROP INDEX IF EXISTS idx_trades_trader_position;

-- Create a regular unique constraint on position_id (without WHERE clause)
-- This will work with upsert but allows multiple NULL position_ids
CREATE UNIQUE INDEX idx_trades_position_id_unique ON public.trades (position_id) WHERE position_id IS NOT NULL;