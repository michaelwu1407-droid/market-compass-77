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
  // Extended eToro fields
  profitable_weeks_pct: number;
  profitable_months_pct: number;
  aum: number | null;
  active_since: string;
  country: string;
  verified: boolean;
  avg_trade_duration_days: number;
  trades_per_week: number;
  win_rate: number;
  long_short_ratio: number;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  daily_var: number | null;
  beta: number | null;
  monthly_returns: { month: string; return_pct: number }[];
  performance_history: { date: string; value: number }[];
  copier_history: { date: string; count: number }[];
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
  // Extended eToro fields
  pe_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  avg_volume: number | null;
  beta: number | null;
  day_high: number | null;
  day_low: number | null;
  open_price: number | null;
  prev_close: number | null;
  change_today: number;
  change_today_pct: number;
  price_history: { date: string; price: number }[];
  logo_url?: string;
}

export interface Post {
  id: string;
  source: 'etoro';
  source_post_id: string;
  // DB-aligned fields (optional; the feed maps DB rows into this UI shape)
  content?: string;
  asset_ids?: string[] | null;
  mentioned_symbols?: string[] | null;
  shares?: number | null;
  sentiment?: string | null;
  etoro_post_id?: string | null;
  posted_at?: string | null;
  etoro_username?: string | null;

  trader_id: string | null;
  asset_id: string | null;
  text: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  raw_json: Record<string, unknown>;
  // New poster/engagement fields
  poster_id?: string | null;
  poster_first?: string;
  poster_last?: string;
  poster_avatar?: string;
  likes?: number;
  comments?: number;
  // Joined data
  trader?: Trader;
  asset?: Asset;
  // Extended fields
  comments_list?: { id: string; author: string; text: string; created_at: string }[];
  images?: string[];
  is_pinned?: boolean;

  // Debug classification fields (used in FeedCard for debugging)
  _classif?: string;
  _content_source?: string;
  _content_len?: number;
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
