import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Users, FileText, TrendingUp, CheckCircle, XCircle, Zap, Shield, Clock, Play, BarChart3, Package } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import DataHealthCard from '@/components/admin/DataHealthCard';
import KnownIssuesAlert, { KnownIssue } from '@/components/admin/KnownIssuesAlert';
import PipelineStatus from '@/components/admin/PipelineStatus';
import SyncActivityLog, { SyncActivity } from '@/components/admin/SyncActivityLog';

interface SyncStatus {
  isLoading: boolean;
  success: boolean | null;
  message: string | null;
}

interface SyncOptions {
  enableCrossCheck: boolean;
  force: boolean;
  postLimit: number;
}

interface SyncState {
  id: string;
  last_run: string | null;
  last_page: number;
  total_pages: number | null;
  status: string;
  updated_at: string;
}

interface DetailedCounts {
  // Traders
  total_traders: number;
  synced_traders: number;
  traders_with_risk_score: number;
  traders_with_sharpe: number;
  traders_with_sortino: number;
  traders_with_alpha: number;
  traders_with_beta: number;
  traders_with_volatility: number;
  traders_with_max_drawdown: number;
  traders_with_gain_12m: number;
  traders_with_copiers: number;
  traders_with_trades: number;
  traders_with_holdings: number;
  traders_with_performance: number;
  // Assets
  total_assets: number;
  assets_with_price: number;
  assets_with_sector: number;
  assets_with_market_cap: number;
  // Totals
  total_holdings: number;
  total_trades: number;
  total_performance: number;
  total_posts: number;
}

export default function AdminSyncPage() {
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({
    worker: { isLoading: false, success: null, message: null },
    posts: { isLoading: false, success: null, message: null },
    dailyMovers: { isLoading: false, success: null, message: null },
  });

  const [options, setOptions] = useState<SyncOptions>({
    enableCrossCheck: false,
    force: false,
    postLimit: 5,
  });

  const [activities, setActivities] = useState<SyncActivity[]>([]);

  // Fetch sync states from database
  const { data: syncStates, refetch: refetchSyncStates } = useQuery({
    queryKey: ['sync-states'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_state')
        .select('*')
        .order('id');
      if (error) throw error;
      return data as SyncState[];
    },
    refetchInterval: 10000,
  });

  // Fetch detailed data counts
  const { data: dataCounts, refetch: refetchCounts } = useQuery({
    queryKey: ['detailed-data-counts'],
    queryFn: async () => {
      const [
        traders, syncedTraders, riskScoreTraders, sharpeTraders, sortinoTraders,
        alphaTraders, betaTraders, volatilityTraders, maxDrawdownTraders, gain12mTraders,
        copiersTraders, assets, assetsWithPrice, assetsWithSector, assetsWithMarketCap,
        holdings, trades, performance, posts
      ] = await Promise.all([
        supabase.from('traders').select('id', { count: 'exact', head: true }),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('details_synced_at', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('risk_score', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('sharpe_ratio', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('sortino_ratio', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('alpha', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('beta', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('volatility', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('max_drawdown', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('gain_12m', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).gt('copiers', 0),
        supabase.from('assets').select('id', { count: 'exact', head: true }),
        supabase.from('assets').select('id', { count: 'exact', head: true }).not('current_price', 'is', null),
        supabase.from('assets').select('id', { count: 'exact', head: true }).not('sector', 'is', null),
        supabase.from('assets').select('id', { count: 'exact', head: true }).not('market_cap', 'is', null),
        supabase.from('trader_holdings').select('id', { count: 'exact', head: true }),
        supabase.from('trades').select('id', { count: 'exact', head: true }),
        supabase.from('trader_performance').select('id', { count: 'exact', head: true }),
        supabase.from('posts').select('id', { count: 'exact', head: true }),
      ]);

      // Count unique traders with holdings/trades/performance
      const [tradersWithHoldings, tradersWithTrades, tradersWithPerformance] = await Promise.all([
        supabase.from('trader_holdings').select('trader_id').limit(1000),
        supabase.from('trades').select('trader_id').limit(1000),
        supabase.from('trader_performance').select('trader_id').limit(1000),
      ]);

      const uniqueHoldingTraders = new Set(tradersWithHoldings.data?.map(h => h.trader_id) || []).size;
      const uniqueTradeTraders = new Set(tradersWithTrades.data?.map(t => t.trader_id) || []).size;
      const uniquePerfTraders = new Set(tradersWithPerformance.data?.map(p => p.trader_id) || []).size;

      return {
        total_traders: traders.count || 0,
        synced_traders: syncedTraders.count || 0,
        traders_with_risk_score: riskScoreTraders.count || 0,
        traders_with_sharpe: sharpeTraders.count || 0,
        traders_with_sortino: sortinoTraders.count || 0,
        traders_with_alpha: alphaTraders.count || 0,
        traders_with_beta: betaTraders.count || 0,
        traders_with_volatility: volatilityTraders.count || 0,
        traders_with_max_drawdown: maxDrawdownTraders.count || 0,
        traders_with_gain_12m: gain12mTraders.count || 0,
        traders_with_copiers: copiersTraders.count || 0,
        traders_with_trades: uniqueTradeTraders,
        traders_with_holdings: uniqueHoldingTraders,
        traders_with_performance: uniquePerfTraders,
        total_assets: assets.count || 0,
        assets_with_price: assetsWithPrice.count || 0,
        assets_with_sector: assetsWithSector.count || 0,
        assets_with_market_cap: assetsWithMarketCap.count || 0,
        total_holdings: holdings.count || 0,
        total_trades: trades.count || 0,
        total_performance: performance.count || 0,
        total_posts: posts.count || 0,
      } as DetailedCounts;
    },
    refetchInterval: 10000,
  });

  const addActivity = (message: string, success: boolean) => {
    setActivities(prev => [
      { timestamp: new Date(), message, success },
      ...prev.slice(0, 19) // Keep last 20
    ]);
  };

  const updateStatus = (key: string, status: Partial<SyncStatus>) => {
    setSyncStatus(prev => ({
      ...prev,
      [key]: { ...prev[key], ...status },
    }));
  };

  const syncFunction = async (name: string, functionName: string, body?: object) => {
    updateStatus(name, { isLoading: true, success: null, message: null });
    
    try {
      const { data, error } = await supabase.functions.invoke(functionName, { body });
      
      if (error) throw error;
      
      const message = data?.action === 'skip' 
        ? 'All data is fresh, nothing to sync'
        : data?.message || `Synced: ${JSON.stringify(data)}`;
      
      updateStatus(name, { 
        isLoading: false, 
        success: true, 
        message
      });
      addActivity(`${functionName}: ${message}`, true);
      toast({ title: 'Success', description: `${functionName} completed` });
      refetchSyncStates();
      refetchCounts();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateStatus(name, { isLoading: false, success: false, message: errorMessage });
      addActivity(`${functionName}: ${errorMessage}`, false);
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const triggerSyncWorker = () => syncFunction('worker', 'sync-worker');
  const syncPosts = () => syncFunction('posts', 'scrape-posts', { traderLimit: options.postLimit });
  const syncDailyMovers = () => syncFunction('dailyMovers', 'scrape-daily-movers');

  const syncAll = async () => {
    for (let i = 0; i < 3; i++) {
      await triggerSyncWorker();
    }
    if (options.postLimit > 0) {
      await syncPosts();
    }
    await syncDailyMovers();
  };

  // Build pipeline stages from sync state
  const tradersState = syncStates?.find(s => s.id === 'traders');
  const estimatedTotalTraders = (tradersState?.total_pages || 1) * 10; // ~10 traders per page

  const getStatusType = (status: string): 'idle' | 'paginating' | 'complete' => {
    if (status === 'paginating') return 'paginating';
    if (status === 'complete') return 'complete';
    return 'idle';
  };

  const pipelineStages = [
    {
      id: 'discovery',
      label: 'Traders Found',
      current: dataCounts?.total_traders || 0,
      total: estimatedTotalTraders,
      status: getStatusType(tradersState?.status || 'idle'),
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: 'details',
      label: 'Details Synced',
      current: dataCounts?.synced_traders || 0,
      total: dataCounts?.total_traders || 0,
      status: 'idle' as const,
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      id: 'metrics',
      label: 'With Metrics',
      current: dataCounts?.traders_with_sharpe || 0,
      total: dataCounts?.total_traders || 0,
      status: 'idle' as const,
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      id: 'assets',
      label: 'Assets',
      current: dataCounts?.total_assets || 0,
      total: dataCounts?.total_assets || 0,
      status: 'idle' as const,
      icon: <Package className="h-4 w-4" />,
    },
  ];

  // Build known issues
  const knownIssues: KnownIssue[] = [];
  
  if (dataCounts?.total_performance === 0) {
    knownIssues.push({
      id: 'performance-404',
      severity: 'critical',
      message: 'Performance API returns 404 - monthly returns cannot be synced',
    });
  }
  
  if (dataCounts && dataCounts.traders_with_risk_score < dataCounts.total_traders * 0.5) {
    knownIssues.push({
      id: 'risk-score-low',
      severity: 'warning',
      message: `Only ${dataCounts.traders_with_risk_score}/${dataCounts.total_traders} traders have risk scores (${((dataCounts.traders_with_risk_score / dataCounts.total_traders) * 100).toFixed(0)}%)`,
    });
  }
  
  if (dataCounts && dataCounts.assets_with_sector < dataCounts.total_assets * 0.1) {
    knownIssues.push({
      id: 'sectors-low',
      severity: 'warning',
      message: `Asset sectors not enriched: ${dataCounts.assets_with_sector}/${dataCounts.total_assets} (${((dataCounts.assets_with_sector / dataCounts.total_assets) * 100).toFixed(1)}%)`,
    });
  }

  // Trader fields for health card
  const traderFields = dataCounts ? [
    { label: 'Basic Info (synced)', current: dataCounts.synced_traders, total: dataCounts.total_traders },
    { label: 'Holdings', current: dataCounts.traders_with_holdings, total: dataCounts.total_traders },
    { label: 'Trades', current: dataCounts.traders_with_trades, total: dataCounts.total_traders },
    { label: 'Gain 12m', current: dataCounts.traders_with_gain_12m, total: dataCounts.total_traders },
    { label: 'Max Drawdown', current: dataCounts.traders_with_max_drawdown, total: dataCounts.total_traders },
    { label: 'Risk Score', current: dataCounts.traders_with_risk_score, total: dataCounts.total_traders },
    { label: 'Sharpe Ratio', current: dataCounts.traders_with_sharpe, total: dataCounts.total_traders },
    { label: 'Sortino Ratio', current: dataCounts.traders_with_sortino, total: dataCounts.total_traders },
    { label: 'Alpha', current: dataCounts.traders_with_alpha, total: dataCounts.total_traders },
    { label: 'Beta', current: dataCounts.traders_with_beta, total: dataCounts.total_traders },
    { label: 'Volatility', current: dataCounts.traders_with_volatility, total: dataCounts.total_traders },
    { label: 'Monthly Returns', current: dataCounts.traders_with_performance, total: dataCounts.total_traders, hint: 'API returns 404' },
  ] : [];

  // Asset fields for health card
  const assetFields = dataCounts ? [
    { label: 'Symbol & Name', current: dataCounts.total_assets, total: dataCounts.total_assets },
    { label: 'Current Price', current: dataCounts.assets_with_price, total: dataCounts.total_assets },
    { label: 'Sector', current: dataCounts.assets_with_sector, total: dataCounts.total_assets },
    { label: 'Market Cap', current: dataCounts.assets_with_market_cap, total: dataCounts.total_assets },
  ] : [];

  // Estimate time based on options
  const estimateTime = () => {
    let seconds = 5;
    if (options.enableCrossCheck) seconds += 120;
    if (options.force) seconds += 30;
    if (options.postLimit > 0) seconds += options.postLimit * 10;
    return seconds < 60 ? `~${seconds}s` : `~${Math.ceil(seconds / 60)}m`;
  };

  const estimateCredits = () => {
    let credits = 0;
    if (options.enableCrossCheck) credits += 20;
    credits += options.postLimit;
    return credits;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Admin: Data Sync</h1>
        <p className="text-muted-foreground">
          Continuous sync runs every 2 minutes. Pagination: page {tradersState?.last_page || 0}/{tradersState?.total_pages || '?'}
        </p>
      </div>

      {/* Known Issues Alert */}
      <KnownIssuesAlert issues={knownIssues} />

      {/* Pipeline Status */}
      <PipelineStatus stages={pipelineStages} />

      {/* Data Health Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <DataHealthCard
          title={`Trader Fields (${dataCounts?.total_traders || 0} traders)`}
          icon={<Users className="h-4 w-4" />}
          fields={traderFields}
        />
        <DataHealthCard
          title={`Asset Fields (${dataCounts?.total_assets || 0} assets)`}
          icon={<Package className="h-4 w-4" />}
          fields={assetFields}
        />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <div className="text-3xl font-bold text-primary">{dataCounts?.total_holdings || 0}</div>
          <div className="text-xs text-muted-foreground">Total Holdings</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-3xl font-bold text-primary">{dataCounts?.total_trades || 0}</div>
          <div className="text-xs text-muted-foreground">Total Trades</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-3xl font-bold text-primary">{dataCounts?.total_posts || 0}</div>
          <div className="text-xs text-muted-foreground">Posts Scraped</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-3xl font-bold text-primary">{dataCounts?.total_performance || 0}</div>
          <div className="text-xs text-muted-foreground">Performance Records</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Manual Sync Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Play className="h-4 w-4" />
              Manual Sync
            </CardTitle>
            <CardDescription>Trigger the sync worker manually</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button 
                onClick={triggerSyncWorker} 
                disabled={syncStatus.worker.isLoading}
                className="flex-1"
              >
                {syncStatus.worker.isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Once
              </Button>
              <Button onClick={syncAll} variant="outline" className="flex-1">
                Sync All (3x)
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={syncPosts}
                disabled={syncStatus.posts.isLoading || options.postLimit === 0}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                {syncStatus.posts.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
                Posts
              </Button>
              <Button
                onClick={syncDailyMovers}
                disabled={syncStatus.dailyMovers.isLoading}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                {syncStatus.dailyMovers.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3 mr-1" />}
                Daily Movers
              </Button>
            </div>

            {syncStatus.worker.message && (
              <p className={`text-xs ${syncStatus.worker.success ? 'text-green-600' : 'text-destructive'}`}>
                {syncStatus.worker.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <SyncActivityLog activities={activities} />
      </div>

      {/* Scraping Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-4 w-4" />
            Scraping Options
          </CardTitle>
          <CardDescription>Configure Firecrawl-based scraping (uses credits)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Enable Cross-Checking
              </Label>
              <p className="text-xs text-muted-foreground">Uses ~20 Firecrawl credits</p>
            </div>
            <Switch
              checked={options.enableCrossCheck}
              onCheckedChange={(checked) => setOptions(prev => ({ ...prev, enableCrossCheck: checked }))}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Post Limit
              </Label>
              <span className="text-sm font-medium">
                {options.postLimit === 0 ? 'Disabled' : `${options.postLimit} traders`}
              </span>
            </div>
            <Slider
              value={[options.postLimit]}
              onValueChange={([value]) => setOptions(prev => ({ ...prev, postLimit: value }))}
              min={0}
              max={20}
              step={1}
            />
          </div>

          <div className="flex items-center gap-4 pt-2 border-t text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Est: <strong>{estimateTime()}</strong>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Credits: <strong>~{estimateCredits()}</strong>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
