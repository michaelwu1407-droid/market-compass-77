import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, AlertTriangle, Users, Sparkles, Star, CheckCircle2, Globe, Calendar, Target, Clock, BarChart3 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PriceChart } from '@/components/charts/PriceChart';
import { RiskGauge } from '@/components/charts/RiskGauge';
import { MonthlyReturnsGrid } from '@/components/charts/MonthlyReturnsGrid';
import { AllocationPieChart } from '@/components/charts/AllocationPieChart';
import { CopierTrendChart } from '@/components/charts/CopierTrendChart';
import { traders, traderHoldings, trades, posts } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

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

  const trader = traders.find(t => t.id === traderId);
  const holdings = traderHoldings[traderId || ''] || [];
  const traderTrades = trades.filter(t => t.trader_id === traderId);
  const traderPosts = posts.filter(p => p.trader_id === traderId);

  if (!trader) {
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
                <AvatarImage src={trader.avatar_url} />
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
                    <span className="text-lg">{countryFlags[trader.country] || '🌍'}</span>
                  </div>
                  <p className="text-muted-foreground">@{trader.etoro_trader_id}</p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Active since {format(new Date(trader.active_since), 'MMM yyyy')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary">
                    <Users className="h-4 w-4 mr-2" />
                    Follow
                  </Button>
                  <Button onClick={() => navigate('/analysis')}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyse
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Star className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4 max-w-2xl">{trader.bio}</p>

              <div className="flex flex-wrap gap-2">
                {trader.style_tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Key Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-border">
            <div className="stat-card text-center">
              <RiskGauge score={trader.risk_score} size="sm" />
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3 w-3" />
                12M Return
              </div>
              <span className={cn("font-bold text-xl", trader.return_12m >= 0 ? "text-gain" : "text-loss")}>
                {trader.return_12m >= 0 ? '+' : ''}{trader.return_12m}%
              </span>
            </div>
            <div className="stat-card">
              <div className="text-xs text-muted-foreground mb-1">24M Return</div>
              <span className={cn("font-bold text-xl", trader.return_24m >= 0 ? "text-gain" : "text-loss")}>
                {trader.return_24m >= 0 ? '+' : ''}{trader.return_24m}%
              </span>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <AlertTriangle className="h-3 w-3" />
                Max Drawdown
              </div>
              <span className="font-bold text-xl text-loss">{trader.max_drawdown}%</span>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Users className="h-3 w-3" />
                Copiers
              </div>
              <span className="font-bold text-xl">{(trader.num_copiers / 1000).toFixed(1)}K</span>
              <CopierTrendChart data={trader.copier_history.slice(-12)} height={30} />
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
          {/* Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <PriceChart 
                data={trader.performance_history} 
                height={300}
                color={trader.return_12m >= 0 ? 'gain' : 'loss'}
              />
            </CardContent>
          </Card>

          {/* Monthly Returns */}
          <Card>
            <CardContent className="pt-6">
              <MonthlyReturnsGrid returns={trader.monthly_returns} />
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="text-sm font-medium mb-3">Profitability</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Profitable Weeks</span>
                  <span className="font-medium">{trader.profitable_weeks_pct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Profitable Months</span>
                  <span className="font-medium">{trader.profitable_months_pct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Win Rate</span>
                  <span className="font-medium">{trader.win_rate}%</span>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <h4 className="text-sm font-medium mb-3">Trading Style</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Trade Duration</span>
                  <span className="font-medium">{trader.avg_trade_duration_days} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Trades per Week</span>
                  <span className="font-medium">{trader.trades_per_week}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Long/Short Ratio</span>
                  <span className="font-medium">{(trader.long_short_ratio * 100).toFixed(0)}% Long</span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="portfolio">
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Allocation</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationPieChart holdings={holdings} height={220} />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Current Holdings</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((holding) => (
                      <TableRow 
                        key={holding.asset.id}
                        className="cursor-pointer hover:bg-secondary/50"
                        onClick={() => navigate(`/assets/${holding.asset.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{holding.asset.name}</div>
                            <Badge variant="secondary" className="text-xs">{holding.asset.ticker}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{holding.asset.sector}</TableCell>
                        <TableCell className="text-right font-medium">{holding.weight_pct}%</TableCell>
                        <TableCell className={cn("text-right font-medium", holding.pnl_pct >= 0 ? "text-gain" : "text-loss")}>
                          {holding.pnl_pct >= 0 ? '+' : ''}{holding.pnl_pct}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stats">
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
                  <span className="text-muted-foreground">Win Rate</span>
                  <span className="font-medium">{trader.win_rate}%</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Avg Trade Duration</span>
                  <span className="font-medium">{trader.avg_trade_duration_days} days</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Trades per Week</span>
                  <span className="font-medium">{trader.trades_per_week}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Long Positions</span>
                  <span className="font-medium">{(trader.long_short_ratio * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Short Positions</span>
                  <span className="font-medium">{((1 - trader.long_short_ratio) * 100).toFixed(0)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Advanced Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Sharpe Ratio</span>
                  <span className="font-medium">{trader.sharpe_ratio?.toFixed(2) || '-'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Sortino Ratio</span>
                  <span className="font-medium">{trader.sortino_ratio?.toFixed(2) || '-'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Beta</span>
                  <span className="font-medium">{trader.beta?.toFixed(2) || '-'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Daily VaR (95%)</span>
                  <span className="font-medium">{trader.daily_var?.toFixed(1) || '-'}%</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Max Drawdown</span>
                  <span className="font-medium text-loss">{trader.max_drawdown}%</span>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Profitability Over Time
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-secondary/30 rounded-lg">
                    <div className="text-2xl font-bold text-gain">+{trader.return_12m}%</div>
                    <div className="text-xs text-muted-foreground">12 Month Return</div>
                  </div>
                  <div className="text-center p-4 bg-secondary/30 rounded-lg">
                    <div className="text-2xl font-bold text-gain">+{trader.return_24m}%</div>
                    <div className="text-xs text-muted-foreground">24 Month Return</div>
                  </div>
                  <div className="text-center p-4 bg-secondary/30 rounded-lg">
                    <div className="text-2xl font-bold">{trader.profitable_weeks_pct}%</div>
                    <div className="text-xs text-muted-foreground">Profitable Weeks</div>
                  </div>
                  <div className="text-center p-4 bg-secondary/30 rounded-lg">
                    <div className="text-2xl font-bold">{trader.profitable_months_pct}%</div>
                    <div className="text-xs text-muted-foreground">Profitable Months</div>
                  </div>
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
              {traderTrades.length > 0 ? (
                <div className="space-y-3">
                  {traderTrades.map((trade) => (
                    <div 
                      key={trade.id} 
                      className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/assets/${trade.asset_id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={cn(
                          trade.trade_type === 'buy' ? "text-gain border-gain" : "text-loss border-loss"
                        )}>
                          {trade.trade_type.toUpperCase()}
                        </Badge>
                        <div>
                          <span className="font-medium">{trade.asset?.name}</span>
                          <span className="text-muted-foreground text-sm ml-2">${trade.asset?.ticker}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${trade.trade_value.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {trade.quantity} shares @ ${trade.price.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(trade.executed_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No recent trades</p>
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
              {traderPosts.length > 0 ? (
                <div className="space-y-4">
                  {traderPosts.map((post) => (
                    <div key={post.id} className="p-4 bg-secondary/30 rounded-lg">
                      {post.is_pinned && (
                        <Badge variant="outline" className="mb-2 text-xs">Pinned</Badge>
                      )}
                      <p className="text-sm mb-3">{post.text}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                        <span>{post.like_count} likes</span>
                        <span>{post.comment_count} comments</span>
                        <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                      </div>
                      {post.comments && post.comments.length > 0 && (
                        <div className="border-t border-border pt-3 mt-3 space-y-2">
                          {post.comments.slice(0, 2).map((comment) => (
                            <div key={comment.id} className="text-xs">
                              <span className="font-medium">{comment.author}:</span>
                              <span className="text-muted-foreground ml-1">{comment.text}</span>
                            </div>
                          ))}
                          {post.comments.length > 2 && (
                            <button className="text-xs text-primary hover:underline">
                              View all {post.comments.length} comments
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No posts yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
