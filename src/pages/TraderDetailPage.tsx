import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, AlertTriangle, Users, Sparkles, Star, CheckCircle2, Calendar, Target, Clock, BarChart3, PieChart, LineChart, RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RiskGauge } from '@/components/charts/RiskGauge';
import { MonthlyReturnsTable } from '@/components/charts/MonthlyReturnsTable';
import { AllocationPieChart } from '@/components/charts/AllocationPieChart';
import { PerformanceBarChart } from '@/components/charts/PerformanceBarChart';
import { PerformanceVsBenchmarkChart } from '@/components/charts/PerformanceVsBenchmarkChart';
import { PortfolioHistoryChart } from '@/components/charts/PortfolioHistoryChart';
import { PerformanceMetrics } from '@/components/trader/PerformanceMetrics';
import { HoldingsTable } from '@/components/trader/HoldingsTable';
import { DiversificationSection } from '@/components/trader/DiversificationSection';
import { AdvancedMetricsCard } from '@/components/trader/AdvancedMetricsCard';
import { DrawdownsTable } from '@/components/trader/DrawdownsTable';
import { DividendsSection } from '@/components/trader/DividendsSection';
import { MarkdownContent } from '@/components/feed/MarkdownContent';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrader } from '@/hooks/useTraders';
import { useTraderHoldings } from '@/hooks/useTraderHoldings';
import { useTraderTrades } from '@/hooks/useTraderTrades';
import { useTraderPerformance } from '@/hooks/useTraderPerformance';
import { useTraderEquityHistory } from '@/hooks/useTraderEquityHistory';
import { useTraderPortfolioHistory } from '@/hooks/useTraderPortfolioHistory';
import { useTraderPosts } from '@/hooks/usePosts';
import { useAnalyse } from '@/hooks/useAnalyse';
import { useFollowedTraders } from '@/hooks/useFollowedTraders';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const countryFlags: Record<string, string> = {
  US: '🇺🇸',
  KR: '🇰🇷',
  GB: '🇬🇧',
  DE: '🇩🇪',
  JP: '🇯🇵',
};

export default function TraderDetailPage() {
  const { traderId } = useParams();
  const navigate = useNavigate();
  const analyseMutation = useAnalyse();
  const { user } = useAuth();
  const { isFollowing, toggleFollow } = useFollowedTraders();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: trader, isLoading: traderLoading, error: traderError, refetch: refetchTrader } = useTrader(traderId);
  const { data: holdings, refetch: refetchHoldings } = useTraderHoldings(traderId);
  const { data: trades, refetch: refetchTrades } = useTraderTrades(traderId);
  const { data: performance, refetch: refetchPerformance } = useTraderPerformance(traderId);
  const { data: equityHistory, refetch: refetchEquity } = useTraderEquityHistory(traderId);
  const { data: portfolioHistory, refetch: refetchPortfolio } = useTraderPortfolioHistory(traderId);
  const { data: posts } = useTraderPosts(traderId);

  const following = traderId ? isFollowing(traderId) : false;

  const handleAnalyse = () => {
    if (traderId) {
      analyseMutation.mutate({ trader_id: traderId, analysis_type: 'comprehensive' });
    }
  };

  const handleRefreshData = async () => {
    if (!traderId) return;
    
    setIsRefreshing(true);
    try {
      toast.info('Refreshing trader data from Bullaware...');
      
      const { data, error } = await supabase.functions.invoke('sync-worker', {
        body: { trader_id: traderId }
      });
      
      if (error) {
        console.error('Sync error:', error);
        toast.error('Failed to refresh data');
      } else {
        console.log('Sync result:', data);
        toast.success('Data refreshed successfully!');
        
        // Refetch all data
        await Promise.all([
          refetchTrader(),
          refetchHoldings(),
          refetchTrades(),
          refetchPerformance(),
          refetchEquity(),
          refetchPortfolio(),
        ]);
      }
    } catch (err) {
      console.error('Refresh error:', err);
      toast.error('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (traderLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/traders')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to traders
        </Button>
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (traderError || !trader) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Trader not found</p>
        <Button variant="ghost" onClick={() => navigate('/traders')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to traders
        </Button>
      </div>
    );
  }

  const formatAUM = (aum: number | null) => {
    if (!aum) return '-';
    if (aum >= 1e9) return `$${(aum / 1e9).toFixed(1)}B`;
    if (aum >= 1e6) return `$${(aum / 1e6).toFixed(1)}M`;
    return `$${(aum / 1e3).toFixed(0)}K`;
  };

  // Transform holdings for allocation pie chart
  // Use current_value as allocation if allocation_pct is null (API stores it there)
  const holdingsForChart = (holdings || []).map(h => ({
    asset: {
      id: h.asset_id || '',
      name: h.assets?.name || 'Unknown',
      ticker: h.assets?.symbol || 'N/A',
      sector: h.assets?.sector || 'Other',
    },
    weight_pct: h.allocation_pct ?? h.current_value ?? 0,
    pnl_pct: h.profit_loss_pct || 0,
  }));

  const copiers = trader.copiers || 0;
  const gain12m = trader.gain_12m || 0;
  const gain24m = trader.gain_24m || 0;
  const tags = trader.tags || [];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate('/traders')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to traders
      </Button>

      {/* Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={trader.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">{trader.display_name[0]}</AvatarFallback>
              </Avatar>
              {trader.verified && (
                <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
                  <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl font-bold">{trader.display_name}</h1>
                    <span className="text-lg">{countryFlags[trader.country || ''] || '🌍'}</span>
                  </div>
                  <p className="text-muted-foreground">@{trader.etoro_username}</p>
                  {trader.active_since && (
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Active since {format(new Date(trader.active_since), 'MMM yyyy')}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant={following ? "default" : "secondary"}
                    onClick={() => traderId && toggleFollow(traderId)}
                    disabled={!user}
                  >
                    {following ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Following
                      </>
                    ) : (
                      <>
                        <Users className="h-4 w-4 mr-2" />
                        Follow
                      </>
                    )}
                  </Button>
                  <Button onClick={handleAnalyse} disabled={analyseMutation.isPending}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {analyseMutation.isPending ? 'Analysing...' : 'Analyse'}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleRefreshData}
                    disabled={isRefreshing}
                    title="Refresh data from Bullaware"
                  >
                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Star className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {trader.bio && (
                <p className="text-sm text-muted-foreground mb-4 max-w-2xl">{trader.bio}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Key Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-border">
            <div className="stat-card text-center">
              <RiskGauge score={trader.risk_score || 0} size="sm" />
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3 w-3" />
                12M Return
              </div>
              <span className={cn("font-bold text-xl", gain12m >= 0 ? "text-gain" : "text-loss")}>
                {gain12m >= 0 ? '+' : ''}{gain12m.toFixed(1)}%
              </span>
            </div>
            <div className="stat-card">
              <div className="text-xs text-muted-foreground mb-1">24M Return</div>
              <span className={cn("font-bold text-xl", gain24m >= 0 ? "text-gain" : "text-loss")}>
                {gain24m >= 0 ? '+' : ''}{gain24m.toFixed(1)}%
              </span>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <AlertTriangle className="h-3 w-3" />
                Max Drawdown
              </div>
              <span className="font-bold text-xl text-loss">{trader.max_drawdown || 0}%</span>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Users className="h-3 w-3" />
                Copiers
              </div>
              <span className="font-bold text-xl">
                {copiers >= 1000 ? `${(copiers / 1000).toFixed(1)}K` : copiers}
              </span>
            </div>
            <div className="stat-card">
              <div className="text-xs text-muted-foreground mb-1">AUM</div>
              <span className="font-bold text-xl">{formatAUM(trader.aum)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Performance vs Benchmark Chart */}
          {equityHistory && equityHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <LineChart className="h-4 w-4" />
                  Performance vs S&P 500
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PerformanceVsBenchmarkChart data={equityHistory} height={280} />
              </CardContent>
            </Card>
          )}

          {/* Performance Metrics */}
          <PerformanceMetrics 
            performance={performance || []}
            gain12m={trader.gain_12m}
            gain24m={trader.gain_24m}
          />

          {/* Monthly Performance Chart */}
          {performance && performance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Monthly Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PerformanceBarChart data={performance} height={220} />
              </CardContent>
            </Card>
          )}

          {/* Monthly Returns Table */}
          {performance && performance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Returns Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyReturnsTable performance={performance} />
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="text-sm font-medium mb-3">Profitability</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Profitable Weeks</span>
                  <span className="font-medium">{trader.profitable_weeks_pct || '-'}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Profitable Months</span>
                  <span className="font-medium">{trader.profitable_months_pct || '-'}%</span>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <h4 className="text-sm font-medium mb-3">Trading Style</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Holding Time</span>
                  <span className="font-medium">{trader.avg_holding_time_days || '-'} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Trades per Week</span>
                  <span className="font-medium">{trader.avg_trades_per_week || '-'}</span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-6">
          {/* Portfolio History Stacked Area Chart */}
          {portfolioHistory && portfolioHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Portfolio Composition Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PortfolioHistoryChart data={portfolioHistory} height={280} />
              </CardContent>
            </Card>
          )}

          {/* Diversification Section */}
          <DiversificationSection holdings={holdings || []} />

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4" />
                  Allocation
                </CardTitle>
              </CardHeader>
              <CardContent>
                {holdingsForChart.length > 0 ? (
                  <AllocationPieChart holdings={holdingsForChart} height={220} />
                ) : (
                  <p className="text-muted-foreground text-sm">No holdings data available</p>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Current Holdings</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <HoldingsTable holdings={holdings || []} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="space-y-6">
          {/* Performance Metrics */}
          <PerformanceMetrics 
            performance={performance || []}
            gain12m={trader.gain_12m}
            gain24m={trader.gain_24m}
          />

          {/* Advanced Metrics */}
          <div className="grid md:grid-cols-2 gap-6">
            <AdvancedMetricsCard 
              sharpeRatio={trader.sharpe_ratio}
              sortinoRatio={trader.sortino_ratio}
              beta={trader.beta}
              alpha={trader.alpha}
              volatility={trader.volatility}
              omegaRatio={(trader as any).omega_ratio}
              treynorRatio={(trader as any).treynor_ratio}
              calmarRatio={(trader as any).calmar_ratio}
              informationRatio={(trader as any).information_ratio}
            />
            <DrawdownsTable 
              drawdowns={[]} 
              maxDrawdown={trader.max_drawdown} 
              dailyDrawdown={trader.daily_drawdown}
            />
          </div>

          {/* Diversification Section */}
          <DiversificationSection holdings={holdings || []} />

          {/* Dividends */}
          <DividendsSection
            portfolioDividendYield={null}
            totalHoldings={holdings?.length}
          />

          {/* Performance Chart */}
          {performance && performance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Historical Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PerformanceBarChart data={performance} height={250} />
              </CardContent>
            </Card>
          )}

          {/* Monthly Returns Table */}
          {performance && performance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Monthly Returns Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyReturnsTable performance={performance} />
              </CardContent>
            </Card>
          )}

          {/* Current Holdings */}
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Holdings</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <HoldingsTable holdings={holdings || []} />
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Trading Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Avg Holding Time</span>
                  <span className="font-medium">{trader.avg_holding_time_days || '-'} days</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Trades per Week</span>
                  <span className="font-medium">{trader.avg_trades_per_week || '-'}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Profitable Weeks</span>
                  <span className="font-medium">{trader.profitable_weeks_pct || '-'}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Max Drawdown</span>
                  <span className="font-medium text-loss">{trader.max_drawdown || '-'}%</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">12 Month Return</span>
                  <span className={cn("font-medium", gain12m >= 0 ? "text-gain" : "text-loss")}>
                    {gain12m >= 0 ? '+' : ''}{gain12m.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">24 Month Return</span>
                  <span className={cn("font-medium", gain24m >= 0 ? "text-gain" : "text-loss")}>
                    {gain24m >= 0 ? '+' : ''}{gain24m.toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            <CardContent>
              {trades && trades.length > 0 ? (
                <div className="space-y-3">
                  {trades.map((trade) => (
                    <div 
                      key={trade.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={trade.action === 'buy' ? 'default' : 'destructive'}>
                          {trade.action.toUpperCase()}
                        </Badge>
                        <div>
                          <div className="font-medium">{trade.assets?.name || 'Unknown Asset'}</div>
                          <div className="text-xs text-muted-foreground">
                            {trade.executed_at && formatDistanceToNow(new Date(trade.executed_at), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {trade.price && <div className="font-medium">${trade.price.toFixed(2)}</div>}
                        {trade.percentage_of_portfolio && (
                          <div className="text-xs text-muted-foreground">{trade.percentage_of_portfolio}% of portfolio</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No trade activity available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posts">
          <Card>
            <CardHeader>
              <CardTitle>Posts</CardTitle>
            </CardHeader>
            <CardContent>
              {posts && posts.length > 0 ? (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <div key={post.id} className="p-4 rounded-lg border border-border">
                      <MarkdownContent content={post.content} className="mb-3" />
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>❤️ {post.likes || 0}</span>
                        <span>💬 {post.comments || 0}</span>
                        {post.posted_at && (
                          <span>{formatDistanceToNow(new Date(post.posted_at), { addSuffix: true })}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No posts available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
