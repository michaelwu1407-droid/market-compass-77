import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Sparkles, Star, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PriceChart } from '@/components/charts/PriceChart';
import { useAsset } from '@/hooks/useAssets';
import { useAssetPosts, useAssetHolders } from '@/hooks/useAssetPosts';
import { useAssetPriceHistory } from '@/hooks/useAssetPriceHistory';
import { useRefreshAsset } from '@/hooks/useRefreshAsset';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { StockNews } from '@/components/asset/StockNews';

export default function AssetDetailPage() {
  const { assetId } = useParams();
  const navigate = useNavigate();

  const { data: asset, isLoading: assetLoading, error } = useAsset(assetId);
  const { data: assetPosts, isLoading: postsLoading } = useAssetPosts(assetId);
  const { data: holders, isLoading: holdersLoading } = useAssetHolders(assetId);
  const { data: priceHistory, isLoading: priceHistoryLoading } = useAssetPriceHistory(assetId);
  const refreshAsset = useRefreshAsset();

  const openYahooFinance = () => {
    if (asset?.symbol) {
      window.open(`https://finance.yahoo.com/quote/${asset.symbol}`, '_blank');
    }
  };

  const handleRefresh = () => {
    if (asset?.id && asset?.symbol) {
      refreshAsset.mutate({ assetId: asset.id, symbol: asset.symbol });
    }
  };

  // Check if data is missing
  const hasNoData = asset && (!asset.current_price || asset.current_price === 0);
  const hasNoPriceHistory = !priceHistoryLoading && (!priceHistory || priceHistory.length === 0);

  const priceHistorySyncedAt = (asset as any)?.price_history_synced_at as string | null | undefined;
  const lastPriceHistoryDate = (priceHistory && priceHistory.length > 0)
    ? priceHistory[priceHistory.length - 1].date
    : null;

  if (assetLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Skeleton className="h-48 w-full mb-6" />
        <Skeleton className="h-64 w-full mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !asset) {
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

  const isPositive = (asset.price_change_pct || 0) >= 0;
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

  const yearRangePercentage = asset.low_52w && asset.high_52w && asset.current_price
    ? ((Number(asset.current_price) - Number(asset.low_52w)) / (Number(asset.high_52w) - Number(asset.low_52w))) * 100
    : 50;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {/* No Data Alert */}
      {hasNoData && (
        <Card className="mb-6 border-warning bg-warning/5">
          <CardContent className="p-4 flex items-center gap-4">
            <AlertCircle className="h-8 w-8 text-warning shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold mb-1">No price data available</h3>
              <p className="text-sm text-muted-foreground">
                Click the refresh button to fetch the latest data from Yahoo Finance.
              </p>
            </div>
            <Button onClick={handleRefresh} disabled={refreshAsset.isPending}>
              <RefreshCw className={cn("h-4 w-4 mr-2", refreshAsset.isPending && "animate-spin")} />
              {refreshAsset.isPending ? 'Fetching...' : 'Fetch Data'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <Card className="mb-6">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
            {/* Logo & Name */}
            <div className="flex items-center gap-4">
              {asset.logo_url ? (
                <img 
                  src={asset.logo_url} 
                  alt={asset.name} 
                  className="w-12 h-12 md:w-14 md:h-14 rounded-lg object-contain bg-secondary p-1"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">{asset.symbol[0]}</span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-bold">{asset.name}</h1>
                  {asset.exchange && <Badge variant="secondary" className="text-xs">{asset.exchange}</Badge>}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <span className="font-medium">${asset.symbol}</span>
                  {asset.sector && (
                    <>
                      <span>·</span>
                      <span className="hidden sm:inline">{asset.sector}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Price & Change */}
            <div className="flex-1 md:text-right">
              {asset.current_price ? (
                <>
                  <div className="text-2xl md:text-3xl font-bold">
                    ${Number(asset.current_price).toFixed(2)}
                  </div>
                  <div className={cn("flex items-center gap-1 md:justify-end", isPositive ? "text-gain" : "text-loss")}>
                    {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    <span className="font-semibold">
                      {isPositive ? '+' : ''}{Number(asset.price_change || 0).toFixed(2)} ({isPositive ? '+' : ''}{Number(asset.price_change_pct || 0).toFixed(2)}%)
                    </span>
                    <span className="text-muted-foreground text-sm ml-1">Today</span>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">No price data</div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border flex-wrap">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshAsset.isPending}
              className="flex-1 sm:flex-none"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", refreshAsset.isPending && "animate-spin")} />
              {refreshAsset.isPending ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button onClick={() => navigate('/analysis')} size="sm" className="flex-1 sm:flex-none">
              <Sparkles className="h-4 w-4 mr-2" />
              Analyse
            </Button>
            <Button variant="secondary" size="sm" className="flex-1 sm:flex-none">
              <Star className="h-4 w-4 mr-2" />
              Star for IC
            </Button>
            <Button variant="outline" size="sm" onClick={openYahooFinance} className="flex-1 sm:flex-none">
              <ExternalLink className="h-4 w-4 mr-2" />
              Yahoo Finance
            </Button>
          </div>

          {/* Last Updated */}
          {asset.updated_at && (
            <div className="mt-3 text-xs text-muted-foreground">
              Last updated: {formatDistanceToNow(new Date(asset.updated_at), { addSuffix: true })}
            </div>
          )}

          {/* Price History Freshness */}
          {priceHistorySyncedAt ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Price history synced: {formatDistanceToNow(new Date(priceHistorySyncedAt), { addSuffix: true })}
            </div>
          ) : lastPriceHistoryDate ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Price history through: {lastPriceHistoryDate}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2">
          {/* Price Chart */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Price History</CardTitle>
            </CardHeader>
            <CardContent>
              {priceHistoryLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : priceHistory && priceHistory.length > 0 ? (
                <PriceChart 
                  data={priceHistory} 
                  height={300}
                  showRangeSelector={true}
                  currency={(asset as any).currency || 'USD'}
                />
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p className="mb-3">No price history available</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefresh}
                    disabled={refreshAsset.isPending}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", refreshAsset.isPending && "animate-spin")} />
                    {refreshAsset.isPending ? 'Fetching...' : 'Fetch Price History'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content Tabs */}
          <Tabs defaultValue="stats">
            <TabsList className="mb-4 w-full justify-start overflow-x-auto">
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="feed">Feed ({assetPosts?.length || 0})</TabsTrigger>
              <TabsTrigger value="holders">Holders ({holders?.length || 0})</TabsTrigger>
            </TabsList>

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
                        <span className="font-medium">{formatLargeNumber(Number(asset.market_cap))}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">P/E Ratio (TTM)</span>
                        <span className="font-medium">{asset.pe_ratio ? Number(asset.pe_ratio).toFixed(2) : '-'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">EPS (TTM)</span>
                        <span className="font-medium">${asset.eps ? Number(asset.eps).toFixed(2) : '-'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Dividend Yield</span>
                        <span className="font-medium">{asset.dividend_yield ? `${Number(asset.dividend_yield).toFixed(2)}%` : '-'}</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">52 Week High</span>
                        <span className="font-medium">{asset.high_52w ? `$${Number(asset.high_52w).toFixed(2)}` : '-'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">52 Week Low</span>
                        <span className="font-medium">{asset.low_52w ? `$${Number(asset.low_52w).toFixed(2)}` : '-'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Avg Volume</span>
                        <span className="font-medium">{formatVolume(Number(asset.avg_volume))}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Beta</span>
                        <span className="font-medium">{asset.beta ? Number(asset.beta).toFixed(2) : '-'}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="feed">
              <Card>
                <CardHeader>
                  <CardTitle>Posts about {asset.symbol}</CardTitle>
                </CardHeader>
                <CardContent>
                  {postsLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                      ))}
                    </div>
                  ) : (assetPosts?.length || 0) > 0 ? (
                    <div className="space-y-4">
                      {assetPosts?.map((post) => (
                        <div key={post.id} className="p-4 bg-secondary/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm">{post.traders?.display_name || 'Unknown'}</span>
                            <span className="text-xs text-muted-foreground">
                              {post.posted_at && formatDistanceToNow(new Date(post.posted_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm mb-2 line-clamp-3">{post.content}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{post.likes || 0} likes</span>
                            <span>{post.comments || 0} comments</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No posts about this asset yet</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="holders">
              <Card>
                <CardHeader>
                  <CardTitle>Traders Holding {asset.symbol}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {holdersLoading ? (
                    <div className="p-4 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (holders?.length || 0) > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Trader</TableHead>
                            <TableHead className="text-right">Weight</TableHead>
                            <TableHead className="text-right">P&L</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {holders?.map((holding) => (
                            <TableRow 
                              key={holding.id} 
                              className="cursor-pointer hover:bg-secondary/50"
                              onClick={() => navigate(`/traders/${holding.trader_id}`)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {holding.traders?.avatar_url ? (
                                    <img 
                                      src={holding.traders.avatar_url} 
                                      alt={holding.traders.display_name}
                                      className="w-8 h-8 rounded-full"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                      <span className="text-xs font-bold">{holding.traders?.display_name?.[0] || '?'}</span>
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-medium">{holding.traders?.display_name || 'Unknown'}</div>
                                    <div className="text-xs text-muted-foreground">@{holding.traders?.etoro_username}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{Number(holding.allocation_pct || 0).toFixed(1)}%</TableCell>
                              <TableCell className={cn("text-right font-medium", (Number(holding.profit_loss_pct) || 0) >= 0 ? "text-gain" : "text-loss")}>
                                {(Number(holding.profit_loss_pct) || 0) >= 0 ? '+' : ''}{Number(holding.profit_loss_pct || 0).toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No traders are holding this asset</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          {/* Stats Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Highlights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 md:p-4 bg-secondary/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Market Cap</div>
                  <div className="font-semibold text-sm md:text-base">{formatLargeNumber(Number(asset.market_cap))}</div>
                </div>
                <div className="p-3 md:p-4 bg-secondary/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">P/E Ratio</div>
                  <div className="font-semibold text-sm md:text-base">{asset.pe_ratio ? Number(asset.pe_ratio).toFixed(1) : '-'}</div>
                </div>
                <div className="p-3 md:p-4 bg-secondary/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">EPS</div>
                  <div className="font-semibold text-sm md:text-base">${asset.eps ? Number(asset.eps).toFixed(2) : '-'}</div>
                </div>
                <div className="p-3 md:p-4 bg-secondary/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Div Yield</div>
                  <div className="font-semibold text-sm md:text-base">{asset.dividend_yield ? `${Number(asset.dividend_yield).toFixed(2)}%` : '-'}</div>
                </div>
                <div className="p-3 md:p-4 bg-secondary/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Avg Volume</div>
                  <div className="font-semibold text-sm md:text-base">{formatVolume(Number(asset.avg_volume))}</div>
                </div>
                <div className="p-3 md:p-4 bg-secondary/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Beta</div>
                  <div className="font-semibold text-sm md:text-base">{asset.beta ? Number(asset.beta).toFixed(2) : '-'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 52 Week Range */}
          {asset.low_52w && asset.high_52w && (
            <Card className="p-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>52 Week Range</span>
                <span>${Number(asset.low_52w).toFixed(2)} - ${Number(asset.high_52w).toFixed(2)}</span>
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
          )}

          {/* News */}
          <StockNews symbol={asset.symbol} />
        </div>
      </div>
    </div>
  );
}
