import { useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, Users, Star, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { DailyMoverRow } from '@/components/daily/DailyMoverRow';
import { TraderMoveCard } from '@/components/daily/TraderMoveCard';
import { useTodayMovers } from '@/hooks/useDailyMovers';
import { useRecentTrades } from '@/hooks/useTrades';
import { useFollowedTradersAssets } from '@/hooks/useFollowedAssets';
import { useFollowedTraders } from '@/hooks/useFollowedTraders';
import { useCreateReport } from '@/hooks/useReports';
import { format } from 'date-fns';
import { useState, useMemo } from 'react';
import { toast } from '@/hooks/use-toast';

export default function DailyPage() {
  const [moverFilter, setMoverFilter] = useState('all');
  const [tradeFilter, setTradeFilter] = useState('all');
  const navigate = useNavigate();
  const today = new Date();

  const { data: dailyMovers, isLoading: moversLoading } = useTodayMovers();
  const { data: recentTrades, isLoading: tradesLoading } = useRecentTrades(10);
  const { followedAssetIds, isLoading: followedLoading } = useFollowedTradersAssets();
  const { followedTraderIds } = useFollowedTraders();
  const createReport = useCreateReport();

  const handleAnalyse = (assetSymbol?: string) => {
    if (assetSymbol) {
      navigate(`/analysis?asset=${encodeURIComponent(assetSymbol)}`);
    } else {
      navigate('/analysis');
    }
  };

  const handleStarForIC = async (assetName?: string, assetSymbol?: string) => {
    try {
      await createReport.mutateAsync({
        title: `Analysis: ${assetName || assetSymbol || 'Asset'}`,
        report_type: 'single_stock',
        status: 'draft',
        starred_for_ic: true,
        input_assets: assetSymbol ? [assetSymbol] : [],
      });
      toast({
        title: 'Starred for IC',
        description: `${assetSymbol || 'Asset'} added to Investment Committee queue.`,
      });
      navigate('/ic');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to star for IC. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Transform daily movers for the DailyMoverRow component
  const transformedMovers = useMemo(() => (dailyMovers || []).map((mover) => ({
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
  })), [dailyMovers]);

  // Filter movers based on selected tab
  const filteredMovers = useMemo(() => {
    switch (moverFilter) {
      case 'watchlist':
        // Watchlist feature coming soon - show empty state
        return [];
      case 'followed':
        // Filter to assets held by followed traders
        return transformedMovers.filter(mover => 
          followedAssetIds.includes(mover.asset_id)
        );
      default:
        return transformedMovers;
    }
  }, [moverFilter, transformedMovers, followedAssetIds]);

  // Transform trades for TraderMoveCard
  const transformedTrades = useMemo(() => (recentTrades || []).map((trade) => ({
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
  })), [recentTrades]);

  // Filter trades based on selected tab
  const filteredTrades = useMemo(() => {
    if (tradeFilter === 'following') {
      return transformedTrades.filter(trade => 
        followedTraderIds.includes(trade.trader_id)
      );
    }
    return transformedTrades;
  }, [tradeFilter, transformedTrades, followedTraderIds]);

  // Generate improved summary with top gainer info
  const getSummaryText = () => {
    // Find top gainer
    const topGainer = transformedMovers.length > 0 
      ? transformedMovers.reduce((max, mover) => 
          mover.pct_change > max.pct_change ? mover : max
        )
      : null;
    
    const topGainerText = topGainer?.asset
      ? `${topGainer.asset.name} (${topGainer.asset.ticker}) leads with ${topGainer.pct_change >= 0 ? '+' : ''}${topGainer.pct_change.toFixed(1)}%`
      : 'Loading daily movers...';

    // Find recent followed trader move
    const followedTrade = transformedTrades.find(t => followedTraderIds.includes(t.trader_id));
    const followedText = followedTrade?.trader
      ? `${followedTrade.trader.display_name} ${followedTrade.trade_type === 'buy' ? 'bought' : 'sold'} ${followedTrade.asset?.ticker || 'an asset'}`
      : followedTraderIds.length > 0 
        ? 'No recent moves from followed traders'
        : 'Follow traders to see their moves';

    return { topGainer: topGainerText, followedMove: followedText };
  };

  const summary = getSummaryText();
  const isFiltering = moverFilter !== 'all' && (moversLoading || followedLoading);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero Card */}
      <Card className="mb-6 bg-gradient-to-br from-primary/5 via-transparent to-accent/10 border-primary/20">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-xl md:text-2xl font-bold">Today's Market Snapshot</h1>
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  US Market Hours
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">{format(today, 'EEEE, MMMM d, yyyy')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Data reflects previous market close (4:00 PM ET) and pre-market activity
              </p>
            </div>
          </div>
          
          <div className="space-y-2 pl-0 md:pl-12">
            <p className="text-sm flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>{summary.topGainer}</span>
            </p>
            <p className="text-sm flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>{summary.followedMove}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Daily Movers Section */}
      <Card className="mb-6">
        <CardHeader className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <TrendingUp className="h-5 w-5 text-primary" />
              Daily Movers
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-2 overflow-x-auto">
            <Tabs value={moverFilter} onValueChange={setMoverFilter}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="watchlist" className="text-xs">Watchlist</TabsTrigger>
                <TabsTrigger value="followed" className="text-xs">Followed Impacted</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {moversLoading || isFiltering ? (
            <div className="divide-y divide-border">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4">
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : moverFilter === 'watchlist' ? (
            <div className="text-center py-8 text-muted-foreground">
              <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Watchlist feature coming soon</p>
              <p className="text-xs mt-1">Add assets to your watchlist to track them here</p>
            </div>
          ) : filteredMovers.length > 0 ? (
            <div className="divide-y divide-border">
              {filteredMovers.map((mover) => (
                <DailyMoverRow
                  key={mover.id}
                  mover={mover}
                  onAnalyse={() => handleAnalyse(mover.asset?.ticker)}
                  onStarForIC={() => handleStarForIC(mover.asset?.name, mover.asset?.ticker)}
                />
              ))}
            </div>
          ) : moverFilter === 'followed' ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No holdings from followed traders</p>
              <p className="text-xs mt-1">Follow traders to see their holdings here</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No holdings data yet. Run the scrape-daily-movers edge function.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Traders' Moves */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
            <Users className="h-5 w-5 text-primary" />
            Recent Trader Moves
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-2 overflow-x-auto">
            <Tabs value={tradeFilter} onValueChange={setTradeFilter}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="following" className="text-xs">Following</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="p-4">
            {tradesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : filteredTrades.length > 0 ? (
              <div className="space-y-4">
                {filteredTrades.map((trade) => (
                  <TraderMoveCard key={trade.id} trade={trade} />
                ))}
              </div>
            ) : tradeFilter === 'following' ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No recent moves from followed traders</p>
                <p className="text-xs mt-1">Follow traders to see their moves here</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No recent trades found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
