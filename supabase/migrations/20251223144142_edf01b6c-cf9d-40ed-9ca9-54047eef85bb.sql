-- Add new advanced metrics columns to traders table
ALTER TABLE public.traders 
ADD COLUMN IF NOT EXISTS omega_ratio numeric,
ADD COLUMN IF NOT EXISTS treynor_ratio numeric,
ADD COLUMN IF NOT EXISTS calmar_ratio numeric,
ADD COLUMN IF NOT EXISTS information_ratio numeric;

-- Add unique constraint on trader_performance for proper upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trader_performance_trader_year_month_unique'
  ) THEN
    ALTER TABLE public.trader_performance ADD CONSTRAINT trader_performance_trader_year_month_unique UNIQUE (trader_id, year, month);
  END IF;
END $$;

-- Add unique constraint on trader_equity_history for proper upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trader_equity_history_trader_date_unique'
  ) THEN
    ALTER TABLE public.trader_equity_history ADD CONSTRAINT trader_equity_history_trader_date_unique UNIQUE (trader_id, date);
  END IF;
END $$;

-- Add unique constraint on trader_portfolio_history for proper upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trader_portfolio_history_trader_date_unique'
  ) THEN
    ALTER TABLE public.trader_portfolio_history ADD CONSTRAINT trader_portfolio_history_trader_date_unique UNIQUE (trader_id, date);
  END IF;
END $$;

-- Add unique constraint on trader_holdings for proper upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trader_holdings_trader_asset_unique'
  ) THEN
    ALTER TABLE public.trader_holdings ADD CONSTRAINT trader_holdings_trader_asset_unique UNIQUE (trader_id, asset_id);
  END IF;
END $$;

-- Delete assets with purely numeric symbols (these are instrumentIds, not real symbols)
DELETE FROM public.assets WHERE symbol ~ '^[0-9]+$';