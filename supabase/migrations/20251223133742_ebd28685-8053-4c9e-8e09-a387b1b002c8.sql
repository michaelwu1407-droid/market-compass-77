-- Add advanced metrics columns to traders table for Bullaware stats
ALTER TABLE public.traders
ADD COLUMN IF NOT EXISTS sharpe_ratio numeric NULL,
ADD COLUMN IF NOT EXISTS sortino_ratio numeric NULL,
ADD COLUMN IF NOT EXISTS alpha numeric NULL,
ADD COLUMN IF NOT EXISTS beta numeric NULL,
ADD COLUMN IF NOT EXISTS volatility numeric NULL,
ADD COLUMN IF NOT EXISTS daily_drawdown numeric NULL;