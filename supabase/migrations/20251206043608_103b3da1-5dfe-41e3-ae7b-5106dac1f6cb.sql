-- Create traders table (eToro investor profiles)
CREATE TABLE public.traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etoro_username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  country TEXT,
  verified BOOLEAN DEFAULT false,
  risk_score INTEGER CHECK (risk_score >= 1 AND risk_score <= 10),
  gain_12m NUMERIC(10,2),
  gain_24m NUMERIC(10,2),
  max_drawdown NUMERIC(10,2),
  copiers INTEGER DEFAULT 0,
  aum NUMERIC(15,2),
  profitable_weeks_pct NUMERIC(5,2),
  profitable_months_pct NUMERIC(5,2),
  avg_trades_per_week NUMERIC(5,2),
  avg_holding_time_days NUMERIC(8,2),
  active_since DATE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create assets table (stocks/ETFs)
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT DEFAULT 'stock',
  logo_url TEXT,
  exchange TEXT,
  sector TEXT,
  industry TEXT,
  market_cap NUMERIC(20,2),
  pe_ratio NUMERIC(10,2),
  eps NUMERIC(10,2),
  dividend_yield NUMERIC(5,2),
  beta NUMERIC(5,2),
  high_52w NUMERIC(15,2),
  low_52w NUMERIC(15,2),
  avg_volume BIGINT,
  current_price NUMERIC(15,2),
  price_change NUMERIC(10,2),
  price_change_pct NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create posts table (discussion feed)
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES public.traders(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  asset_ids UUID[],
  mentioned_symbols TEXT[],
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  sentiment TEXT CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  source TEXT DEFAULT 'etoro',
  etoro_post_id TEXT,
  posted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create trades table (portfolio activity)
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES public.traders(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  amount NUMERIC(15,2),
  price NUMERIC(15,4),
  percentage_of_portfolio NUMERIC(5,2),
  executed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create daily_movers table
CREATE TABLE public.daily_movers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  direction TEXT CHECK (direction IN ('up', 'down')),
  change_pct NUMERIC(10,2),
  volume BIGINT,
  ai_summary TEXT,
  top_traders_trading UUID[],
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, date)
);

-- Create reports table (analysis output)
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  asset_id UUID REFERENCES public.assets(id),
  trader_id UUID REFERENCES public.traders(id),
  report_type TEXT DEFAULT 'analysis',
  content TEXT,
  ai_generated BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'rejected')),
  starred_for_ic BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create price_history table
CREATE TABLE public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  open_price NUMERIC(15,4),
  high_price NUMERIC(15,4),
  low_price NUMERIC(15,4),
  close_price NUMERIC(15,4),
  volume BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, date)
);

-- Create trader_performance table (monthly returns)
CREATE TABLE public.trader_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES public.traders(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  return_pct NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(trader_id, year, month)
);

-- Create trader_holdings table (current portfolio)
CREATE TABLE public.trader_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES public.traders(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  allocation_pct NUMERIC(5,2),
  avg_open_price NUMERIC(15,4),
  current_value NUMERIC(15,2),
  profit_loss_pct NUMERIC(10,2),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(trader_id, asset_id)
);

-- Enable RLS on all tables
ALTER TABLE public.traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_movers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trader_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trader_holdings ENABLE ROW LEVEL SECURITY;

-- Create public read policies (this data is research data, publicly readable)
CREATE POLICY "Anyone can view traders" ON public.traders FOR SELECT USING (true);
CREATE POLICY "Anyone can view assets" ON public.assets FOR SELECT USING (true);
CREATE POLICY "Anyone can view posts" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Anyone can view trades" ON public.trades FOR SELECT USING (true);
CREATE POLICY "Anyone can view daily_movers" ON public.daily_movers FOR SELECT USING (true);
CREATE POLICY "Anyone can view reports" ON public.reports FOR SELECT USING (true);
CREATE POLICY "Anyone can view price_history" ON public.price_history FOR SELECT USING (true);
CREATE POLICY "Anyone can view trader_performance" ON public.trader_performance FOR SELECT USING (true);
CREATE POLICY "Anyone can view trader_holdings" ON public.trader_holdings FOR SELECT USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_traders_updated_at BEFORE UPDATE ON public.traders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trader_holdings_updated_at BEFORE UPDATE ON public.trader_holdings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_posts_trader_id ON public.posts(trader_id);
CREATE INDEX idx_posts_posted_at ON public.posts(posted_at DESC);
CREATE INDEX idx_trades_trader_id ON public.trades(trader_id);
CREATE INDEX idx_trades_asset_id ON public.trades(asset_id);
CREATE INDEX idx_trades_executed_at ON public.trades(executed_at DESC);
CREATE INDEX idx_daily_movers_date ON public.daily_movers(date DESC);
CREATE INDEX idx_price_history_asset_date ON public.price_history(asset_id, date DESC);
CREATE INDEX idx_trader_performance_trader ON public.trader_performance(trader_id);
CREATE INDEX idx_trader_holdings_trader ON public.trader_holdings(trader_id);