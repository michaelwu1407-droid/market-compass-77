import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Sparkles, Star, Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PriceChart } from '@/components/charts/PriceChart';
import { assets, posts, trades, traders, traderHoldings } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function AssetDetailPage() {
  const { assetId } = useParams();
  const navigate = useNavigate();

  const asset = assets.find(a => a.id === assetId);
  const assetPosts = posts.filter(p => p.asset_id === assetId);
  const assetTrades = trades.filter(t => t.asset_id === assetId);
  
  // Find which traders hold this asset
  const holders = Object.entries(traderHoldings)
    .filter(([, holdings]) => holdings.some(h => h.asset.id === assetId))
    .map(([traderId, holdings]) => ({
      trader: traders.find(t => t.id === traderId)!,
      holding: holdings.find(h => h.asset.id === assetId)!,
    }))
    .filter(h => h.trader);

  if (!asset) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Asset not found</p>
        <Button variant="ghost" onClick={() => navigate(-1)} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>
      </div>
    );
  }

  const isPositive = asset.change_today_pct >= 0;
  const formatLargeNumber = (num: number | null) => {
    if (!num) return '-';
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  const formatVolume = (num: number | null) => {
    if (!num) return '-';
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  };

  const dayRangePercentage = asset.day_low && asset.day_high 
    ? ((asset.last_price! - asset.day_low) / (asset.day_high - asset.day_low)) * 100 
    : 50;

  const yearRangePercentage = asset.week_52_low && asset.week_52_high
    ? ((asset.last_price! - asset.week_52_low) / (asset.week_52_high - asset.week_52_low)) * 100
    : 50;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {/* Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Logo & Name */}
            <div className="flex items-center gap-4">
              {asset.logo_url ? (
                <img 
                  src={asset.logo_url} 
                  alt={asset.name} 
                  className="w-14 h-14 rounded-lg object-contain bg-secondary p-1"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">{asset.ticker[0]}</span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{asset.name}</h1>
                  <Badge variant="secondary">{asset.exchange}</Badge>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-medium">${asset.ticker}</span>
                  <span>·</span>
                  <span>{asset.sector}</span>
                </div>
              </div>
            </div>

            {/* Price & Change */}
            <div className="flex-1 md:text-right">
              <div className="text-3xl font-bold">${asset.last_price?.toFixed(2)}</div>
              <div className={cn("flex items-center gap-1 md:justify-end", isPositive ? "text-gain" : "text-loss")}>
                {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span className="font-semibold">
                  {isPositive ? '+' : ''}{asset.change_today?.toFixed(2)} ({isPositive ? '+' : ''}{asset.change_today_pct.toFixed(2)}%)
                </span>
                <span className="text-muted-foreground text-sm ml-1">Today</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
            <Button onClick={() => navigate('/analysis')}>
              <Sparkles className="h-4 w-4 mr-2" />
              Analyse
            </Button>
            <Button variant="secondary">
              <Star className="h-4 w-4 mr-2" />
              Star for IC
            </Button>
            <Button variant="secondary">
              <Plus className="h-4 w-4 mr-2" />
              Add to Watchlist
            </Button>
            <Button variant="ghost" size="icon">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Market Cap</div>
          <div className="font-semibold">{formatLargeNumber(asset.market_cap)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">P/E Ratio</div>
          <div className="font-semibold">{asset.pe_ratio?.toFixed(1) || '-'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">EPS</div>
          <div className="font-semibold">${asset.eps?.toFixed(2) || '-'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Div Yield</div>
          <div className="font-semibold">{asset.dividend_yield ? `${asset.dividend_yield.toFixed(2)}%` : '-'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Avg Volume</div>
          <div className="font-semibold">{formatVolume(asset.avg_volume)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Beta</div>
          <div className="font-semibold">{asset.beta?.toFixed(2) || '-'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Open</div>
          <div className="font-semibold">${asset.open_price?.toFixed(2) || '-'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Prev Close</div>
          <div className="font-semibold">${asset.prev_close?.toFixed(2) || '-'}</div>
        </Card>
      </div>

      {/* Range Sliders */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Day Range</span>
            <span>${asset.day_low?.toFixed(2)} - ${asset.day_high?.toFixed(2)}</span>
          </div>
          <div className="relative h-2 bg-secondary rounded-full">
            <div 
              className="absolute top-0 h-full bg-primary rounded-full"
              style={{ width: `${dayRangePercentage}%` }}
            />
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full border-2 border-background"
              style={{ left: `calc(${dayRangePercentage}% - 6px)` }}
            />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>52 Week Range</span>
            <span>${asset.week_52_low?.toFixed(2)} - ${asset.week_52_high?.toFixed(2)}</span>
          </div>
          <div className="relative h-2 bg-secondary rounded-full">
            <div 
              className="absolute top-0 h-full bg-primary rounded-full"
              style={{ width: `${yearRangePercentage}%` }}
            />
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full border-2 border-background"
              style={{ left: `calc(${yearRangePercentage}% - 6px)` }}
            />
          </div>
        </Card>
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="feed">Feed ({assetPosts.length})</TabsTrigger>
          <TabsTrigger value="holders">Holders ({holders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Price Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <PriceChart data={asset.price_history} height={350} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats">
          <Card>
            <CardHeader>
              <CardTitle>Key Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Market Cap</span>
                    <span className="font-medium">{formatLargeNumber(asset.market_cap)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">P/E Ratio (TTM)</span>
                    <span className="font-medium">{asset.pe_ratio?.toFixed(2) || '-'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">EPS (TTM)</span>
                    <span className="font-medium">${asset.eps?.toFixed(2) || '-'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Dividend Yield</span>
                    <span className="font-medium">{asset.dividend_yield ? `${asset.dividend_yield.toFixed(2)}%` : '-'}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">52 Week High</span>
                    <span className="font-medium">${asset.week_52_high?.toFixed(2) || '-'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">52 Week Low</span>
                    <span className="font-medium">${asset.week_52_low?.toFixed(2) || '-'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Avg Volume</span>
                    <span className="font-medium">{formatVolume(asset.avg_volume)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Beta</span>
                    <span className="font-medium">{asset.beta?.toFixed(2) || '-'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feed">
          <Card>
            <CardHeader>
              <CardTitle>Posts about {asset.ticker}</CardTitle>
            </CardHeader>
            <CardContent>
              {assetPosts.length > 0 ? (
                <div className="space-y-4">
                  {assetPosts.map((post) => (
                    <div key={post.id} className="p-4 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">{post.trader?.display_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm mb-2">{post.text}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{post.like_count} likes</span>
                        <span>{post.comment_count} comments</span>
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

        <TabsContent value="holders">
          <Card>
            <CardHeader>
              <CardTitle>Followed Traders Holding {asset.ticker}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {holders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trader</TableHead>
                      <TableHead>12M Return</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holders.map(({ trader, holding }) => (
                      <TableRow 
                        key={trader.id} 
                        className="cursor-pointer hover:bg-secondary/50"
                        onClick={() => navigate(`/traders/${trader.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <img 
                              src={trader.avatar_url} 
                              alt={trader.display_name}
                              className="w-8 h-8 rounded-full"
                            />
                            <div>
                              <div className="font-medium">{trader.display_name}</div>
                              <div className="text-xs text-muted-foreground">@{trader.etoro_trader_id}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className={cn(trader.return_12m >= 0 ? "text-gain" : "text-loss")}>
                          {trader.return_12m >= 0 ? '+' : ''}{trader.return_12m}%
                        </TableCell>
                        <TableCell className="text-right">{holding.weight_pct}%</TableCell>
                        <TableCell className={cn("text-right font-medium", holding.pnl_pct >= 0 ? "text-gain" : "text-loss")}>
                          {holding.pnl_pct >= 0 ? '+' : ''}{holding.pnl_pct}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No followed traders hold this asset</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
