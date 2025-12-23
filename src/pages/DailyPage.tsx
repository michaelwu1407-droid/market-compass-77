import { useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DailyMoverRow } from '@/components/daily/DailyMoverRow';
import { TraderMoveCard } from '@/components/daily/TraderMoveCard';
import { useTodayMovers } from '@/hooks/useDailyMovers';
import { useRecentTrades } from '@/hooks/useTrades';
import { format } from 'date-fns';
import { useState } from 'react';

export default function DailyPage() {
  const [moverFilter, setMoverFilter] = useState('all');
  const navigate = useNavigate();
  const today = new Date();

  const { data: dailyMovers, isLoading: moversLoading } = useTodayMovers();
  const { data: recentTrades, isLoading: tradesLoading } = useRecentTrades(10);

  const handleAnalyse = (assetId?: string) => {
    navigate('/analysis');
  };

  const handleStarForIC = () => {
    navigate('/ic');
  };

  // Transform daily movers for the DailyMoverRow component
  const transformedMovers = (dailyMovers || []).map((mover) => ({
    id: mover.id,
    asset_id: mover.asset_id || '',
    date: mover.date,
    pct_change: mover.change_pct || 0,
    volume: mover.volume,
    reason_summary: mover.ai_summary || '',
    created_at: mover.created_at || '',
    asset: mover.assets ? {
      id: mover.assets.id,
      ticker: mover.assets.symbol,
      name: mover.assets.name,
      exchange: mover.assets.exchange || '',
      sector: mover.assets.sector || '',
      country: 'US',
      market_cap: mover.assets.market_cap ? Number(mover.assets.market_cap) : null,
      last_price: mover.assets.current_price ? Number(mover.assets.current_price) : null,
      currency: 'USD',
      created_at: mover.assets.created_at || '',
      updated_at: mover.assets.updated_at || '',
      pe_ratio: mover.assets.pe_ratio ? Number(mover.assets.pe_ratio) : null,
      eps: mover.assets.eps ? Number(mover.assets.eps) : null,
      dividend_yield: mover.assets.dividend_yield ? Number(mover.assets.dividend_yield) : null,
      week_52_high: mover.assets.high_52w ? Number(mover.assets.high_52w) : null,
      week_52_low: mover.assets.low_52w ? Number(mover.assets.low_52w) : null,
      avg_volume: mover.assets.avg_volume ? Number(mover.assets.avg_volume) : null,
      beta: mover.assets.beta ? Number(mover.assets.beta) : null,
      day_high: null,
      day_low: null,
      open_price: null,
      prev_close: null,
      change_today: mover.assets.price_change ? Number(mover.assets.price_change) : 0,
      change_today_pct: mover.assets.price_change_pct ? Number(mover.assets.price_change_pct) : 0,
      price_history: [],
      logo_url: mover.assets.logo_url || undefined,
    } : undefined,
  }));

  // Transform trades for TraderMoveCard
  const transformedTrades = (recentTrades || []).map((trade) => ({
    id: trade.id,
    trader_id: trade.trader_id || '',
    asset_id: trade.asset_id || '',
    trade_type: trade.action as 'buy' | 'sell' | 'close',
    quantity: trade.amount ? Number(trade.amount) : 0,
    price: trade.price ? Number(trade.price) : 0,
    trade_value: (trade.amount && trade.price) ? Number(trade.amount) * Number(trade.price) : 0,
    portfolio_weight_after: trade.percentage_of_portfolio ? Number(trade.percentage_of_portfolio) : null,
    executed_at: trade.executed_at || '',
    raw_json: {},
    trader: trade.traders ? {
      id: trade.traders.id,
      etoro_trader_id: trade.traders.etoro_username,
      display_name: trade.traders.display_name,
      avatar_url: trade.traders.avatar_url || '',
      bio: trade.traders.bio || '',
      risk_score: trade.traders.risk_score || 0,
      return_12m: trade.traders.gain_12m || 0,
      return_24m: trade.traders.gain_24m || 0,
      max_drawdown: trade.traders.max_drawdown || 0,
      num_copiers: trade.traders.copiers || 0,
      style_tags: trade.traders.tags || [],
      created_at: trade.traders.created_at || '',
      updated_at: trade.traders.updated_at || '',
      profitable_weeks_pct: trade.traders.profitable_weeks_pct || 0,
      profitable_months_pct: trade.traders.profitable_months_pct || 0,
      aum: trade.traders.aum ? Number(trade.traders.aum) : null,
      active_since: trade.traders.active_since || '',
      country: trade.traders.country || '',
      verified: trade.traders.verified || false,
      avg_trade_duration_days: trade.traders.avg_holding_time_days || 0,
      trades_per_week: trade.traders.avg_trades_per_week || 0,
      win_rate: 0,
      long_short_ratio: 0,
      sharpe_ratio: null,
      sortino_ratio: null,
      daily_var: null,
      beta: null,
      monthly_returns: [],
      performance_history: [],
      copier_history: [],
    } : undefined,
    asset: trade.assets ? {
      id: trade.assets.id,
      ticker: trade.assets.symbol,
      name: trade.assets.name,
      exchange: trade.assets.exchange || '',
      sector: trade.assets.sector || '',
      country: 'US',
      market_cap: trade.assets.market_cap ? Number(trade.assets.market_cap) : null,
      last_price: trade.assets.current_price ? Number(trade.assets.current_price) : null,
      currency: 'USD',
      created_at: trade.assets.created_at || '',
      updated_at: trade.assets.updated_at || '',
      pe_ratio: trade.assets.pe_ratio ? Number(trade.assets.pe_ratio) : null,
      eps: trade.assets.eps ? Number(trade.assets.eps) : null,
      dividend_yield: trade.assets.dividend_yield ? Number(trade.assets.dividend_yield) : null,
      week_52_high: trade.assets.high_52w ? Number(trade.assets.high_52w) : null,
      week_52_low: trade.assets.low_52w ? Number(trade.assets.low_52w) : null,
      avg_volume: trade.assets.avg_volume ? Number(trade.assets.avg_volume) : null,
      beta: trade.assets.beta ? Number(trade.assets.beta) : null,
      day_high: null,
      day_low: null,
      open_price: null,
      prev_close: null,
      change_today: trade.assets.price_change ? Number(trade.assets.price_change) : 0,
      change_today_pct: trade.assets.price_change_pct ? Number(trade.assets.price_change_pct) : 0,
      price_history: [],
      logo_url: trade.assets.logo_url || undefined,
    } : undefined,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero Card */}
      <Card className="mb-6 bg-gradient-to-br from-primary/5 via-transparent to-accent/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Today's Market in One Glance</h1>
              <p className="text-muted-foreground">{format(today, 'EEEE, MMMM d, yyyy')}</p>
            </div>
          </div>
          
          <div className="space-y-2 pl-12">
            <p className="text-sm flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>{transformedMovers.length > 0 ? `${transformedMovers.length} assets moving significantly today` : 'Loading market data...'}</span>
            </p>
            <p className="text-sm flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>{transformedTrades.length > 0 ? `${transformedTrades.length} recent trades from tracked traders` : 'No recent trades yet'}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Daily Movers Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Daily Movers
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-2">
            <Tabs value={moverFilter} onValueChange={setMoverFilter}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="watchlist" className="text-xs">Watchlist</TabsTrigger>
                <TabsTrigger value="followed" className="text-xs">Followed Impacted</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {moversLoading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4">
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : transformedMovers.length > 0 ? (
            <div className="divide-y divide-border">
              {transformedMovers.map((mover) => (
                <DailyMoverRow
                  key={mover.id}
                  mover={mover}
                  onAnalyse={() => handleAnalyse(mover.asset_id)}
                  onStarForIC={handleStarForIC}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No movers data yet. Run the scrape-daily-movers edge function.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Traders' Moves */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Recent Trader Moves
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tradesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : transformedTrades.length > 0 ? (
            <div className="space-y-4">
              {transformedTrades.map((trade) => (
                <TraderMoveCard key={trade.id} trade={trade} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent trades found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
