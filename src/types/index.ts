// Database Models

export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Trader {
  id: string;
  etoro_trader_id: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  risk_score: number;
  return_12m: number;
  return_24m: number;
  max_drawdown: number;
  num_copiers: number;
  style_tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  country: string;
  market_cap: number | null;
  last_price: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  source: 'etoro';
  source_post_id: string;
  trader_id: string | null;
  asset_id: string | null;
  text: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  raw_json: Record<string, unknown>;
  // Joined data
  trader?: Trader;
  asset?: Asset;
}

export interface TraderFollow {
  id: string;
  user_id: string;
  trader_id: string;
  created_at: string;
}

export interface Trade {
  id: string;
  trader_id: string;
  asset_id: string;
  trade_type: 'buy' | 'sell' | 'close';
  quantity: number;
  price: number;
  trade_value: number;
  portfolio_weight_after: number | null;
  executed_at: string;
  raw_json: Record<string, unknown>;
  // Joined data
  trader?: Trader;
  asset?: Asset;
}

export interface DailyMover {
  id: string;
  asset_id: string;
  date: string;
  pct_change: number;
  volume: number | null;
  reason_summary: string;
  created_at: string;
  // Joined data
  asset?: Asset;
}

export type ReportType = 'single_stock' | 'trader_portfolio' | 'basket';
export type Horizon = '6m' | '12m' | 'long_term';
export type Rating = 'buy' | 'hold' | 'avoid';
export type ReportStatus = 'to_review' | 'in_progress' | 'approved' | 'rejected';

export interface Report {
  id: string;
  user_id: string;
  report_type: ReportType;
  title: string;
  input_assets: string[];
  input_trader_ids: string[];
  horizon: Horizon;
  raw_prompt: string;
  raw_response: string;
  summary: string;
  upside_pct_estimate: number | null;
  rating: Rating | null;
  score_6m: number | null;
  score_12m: number | null;
  score_long_term: number | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export interface ReportStar {
  id: string;
  user_id: string;
  report_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'trader_trade' | 'daily_movers' | 'new_report';
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

// Feed item types
export type FeedItemType = 'post' | 'trade' | 'trending';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  data: Post | Trade | (DailyMover & { mentions_change: number });
  created_at: string;
}

// Trader holdings for portfolio view
export interface TraderHolding {
  asset: Asset;
  weight_pct: number;
  pnl_pct: number;
}
