-- Clear old invalid trades for thomaspj that have null position_id
DELETE FROM public.trades 
WHERE trader_id = '2cb118d9-2e6f-47d0-a089-a60cc06fa076'
  AND position_id IS NULL;

-- Also clear trades with null profit_loss_pct (old format)
DELETE FROM public.trades 
WHERE trader_id = '2cb118d9-2e6f-47d0-a089-a60cc06fa076'
  AND profit_loss_pct IS NULL;

-- Force re-sync by resetting details_synced_at for thomaspj
UPDATE public.traders 
SET details_synced_at = NULL 
WHERE id = '2cb118d9-2e6f-47d0-a089-a60cc06fa076';

-- Create a composite unique index for trades that handles null position_id
-- First drop any existing unique index on position_id alone if it exists
DROP INDEX IF EXISTS idx_trades_position_id;

-- Create a unique constraint on trader_id + position_id (only for non-null position_ids)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_trader_position 
ON public.trades (trader_id, position_id) 
WHERE position_id IS NOT NULL;