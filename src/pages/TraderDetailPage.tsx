import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, AlertTriangle, Users, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { traders, traderHoldings, trades, posts } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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
            <Avatar className="h-20 w-20">
              <AvatarImage src={trader.avatar_url} />
              <AvatarFallback className="text-2xl">{trader.display_name[0]}</AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-2xl font-bold">{trader.display_name}</h1>
                  <p className="text-muted-foreground">@{trader.etoro_trader_id}</p>
                </div>
                <Button onClick={() => navigate('/analysis')}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyse Portfolio
                </Button>
              </div>

              <p className="text-sm text-muted-foreground mb-4">{trader.bio}</p>

              <div className="flex flex-wrap gap-2">
                {trader.style_tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs defaultValue="portfolio">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Performance Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-secondary/30 rounded-lg border border-dashed border-border">
                <p className="text-muted-foreground">Performance chart will be rendered here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio">
          <Card>
            <CardHeader>
              <CardTitle>Current Holdings</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((holding) => (
                    <TableRow key={holding.asset.id}>
                      <TableCell className="font-medium">{holding.asset.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{holding.asset.ticker}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{holding.asset.sector}</TableCell>
                      <TableCell className="text-right">{holding.weight_pct}%</TableCell>
                      <TableCell className={cn("text-right font-medium", holding.pnl_pct >= 0 ? "text-gain" : "text-loss")}>
                        {holding.pnl_pct >= 0 ? '+' : ''}{holding.pnl_pct}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
                    <div key={trade.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
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
                      <p className="text-sm mb-2">{post.text}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{post.like_count} likes</span>
                        <span>{post.comment_count} comments</span>
                        <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                      </div>
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
