-- Add new columns to trades table for proper closed position data
ALTER TABLE public.trades 
ADD COLUMN IF NOT EXISTS open_price numeric,
ADD COLUMN IF NOT EXISTS close_price numeric,
ADD COLUMN IF NOT EXISTS profit_loss_pct numeric,
ADD COLUMN IF NOT EXISTS open_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS position_id bigint;

-- Create unique index on position_id for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_position_id ON public.trades(position_id) WHERE position_id IS NOT NULL;

-- Create index on trader_id and executed_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_trades_trader_executed ON public.trades(trader_id, executed_at DESC);