-- Fix trades deduplication: position_id is not globally unique across traders.
-- Use (trader_id, position_id) as the unique key so different traders can't overwrite each other.

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_position_id_unique;

DROP INDEX IF EXISTS public.idx_trades_position_id_unique;
DROP INDEX IF EXISTS public.idx_trades_position_id;
DROP INDEX IF EXISTS public.idx_trades_trader_position;

ALTER TABLE public.trades
  ADD CONSTRAINT trades_trader_position_unique UNIQUE (trader_id, position_id);
