-- Add country column to assets table for geographic diversification
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS country text;

-- Add weekly_drawdown column to traders table
ALTER TABLE public.traders ADD COLUMN IF NOT EXISTS weekly_drawdown numeric;

-- Create trader_equity_history table for performance vs benchmark chart
CREATE TABLE IF NOT EXISTS public.trader_equity_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trader_id uuid REFERENCES public.traders(id) ON DELETE CASCADE,
  date date NOT NULL,
  equity_value numeric NOT NULL,
  benchmark_value numeric,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(trader_id, date)
);

-- Enable RLS on trader_equity_history
ALTER TABLE public.trader_equity_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for trader_equity_history (read-only for everyone)
CREATE POLICY "Anyone can view trader_equity_history" 
ON public.trader_equity_history 
FOR SELECT 
USING (true);

-- Create trader_portfolio_history table for stacked area chart
CREATE TABLE IF NOT EXISTS public.trader_portfolio_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trader_id uuid REFERENCES public.traders(id) ON DELETE CASCADE,
  date date NOT NULL,
  holdings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(trader_id, date)
);

-- Enable RLS on trader_portfolio_history
ALTER TABLE public.trader_portfolio_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for trader_portfolio_history (read-only for everyone)
CREATE POLICY "Anyone can view trader_portfolio_history" 
ON public.trader_portfolio_history 
FOR SELECT 
USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trader_equity_history_trader_date ON public.trader_equity_history(trader_id, date);
CREATE INDEX IF NOT EXISTS idx_trader_portfolio_history_trader_date ON public.trader_portfolio_history(trader_id, date);
CREATE INDEX IF NOT EXISTS idx_assets_country ON public.assets(country);