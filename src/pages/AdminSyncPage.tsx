import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Users, FileText, TrendingUp, CheckCircle, XCircle, Zap, Shield, Clock, Play, Database, BarChart3, Activity } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';

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

interface DataCounts {
  total_traders: number;
  synced_traders: number;
  traders_with_risk_score: number;
  traders_with_metrics: number;
  total_holdings: number;
  total_trades: number;
  total_performance: number;
  total_assets: number;
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

  // Fetch data counts
  const { data: dataCounts, refetch: refetchCounts } = useQuery({
    queryKey: ['data-counts'],
    queryFn: async () => {
      const [traders, syncedTraders, riskScoreTraders, metricsTraders, holdings, trades, performance, assets, posts] = await Promise.all([
        supabase.from('traders').select('id', { count: 'exact', head: true }),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('details_synced_at', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('risk_score', 'is', null),
        supabase.from('traders').select('id', { count: 'exact', head: true }).not('sharpe_ratio', 'is', null),
        supabase.from('trader_holdings').select('id', { count: 'exact', head: true }),
        supabase.from('trades').select('id', { count: 'exact', head: true }),
        supabase.from('trader_performance').select('id', { count: 'exact', head: true }),
        supabase.from('assets').select('id', { count: 'exact', head: true }),
        supabase.from('posts').select('id', { count: 'exact', head: true }),
      ]);
      
      return {
        total_traders: traders.count || 0,
        synced_traders: syncedTraders.count || 0,
        traders_with_risk_score: riskScoreTraders.count || 0,
        traders_with_metrics: metricsTraders.count || 0,
        total_holdings: holdings.count || 0,
        total_trades: trades.count || 0,
        total_performance: performance.count || 0,
        total_assets: assets.count || 0,
        total_posts: posts.count || 0,
      } as DataCounts;
    },
    refetchInterval: 10000,
  });

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
      toast({ title: 'Success', description: `${functionName} completed` });
      refetchSyncStates();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateStatus(name, { isLoading: false, success: false, message: errorMessage });
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  // Use the new sync-worker for all core syncs
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
    refetchCounts();
  };

  // Format relative time
  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Get status color
  const getStatusColor = (status: string) => {
    if (status === 'paginating') return 'text-yellow-600 bg-yellow-100';
    if (status === 'idle') return 'text-green-600 bg-green-100';
    return 'text-muted-foreground bg-muted';
  };

  // Estimate time based on options
  const estimateTime = () => {
    let seconds = 5;
    if (options.enableCrossCheck) seconds += 120;
    if (options.force) seconds += 30;
    if (options.postLimit > 0) seconds += options.postLimit * 10;
    return seconds < 60 ? `~${seconds}s` : `~${Math.ceil(seconds / 60)}m`;
  };

  // Estimate Firecrawl credits
  const estimateCredits = () => {
    let credits = 0;
    if (options.enableCrossCheck) credits += 20;
    credits += options.postLimit;
    return credits;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Admin: Data Sync</h1>
        <p className="text-muted-foreground">
          Continuous sync runs every 2 minutes automatically. Trigger manual syncs below.
        </p>
      </div>

      {/* Data Statistics Dashboard */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Statistics
          </CardTitle>
          <CardDescription>Current state of synced data in the database</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Traders Progress */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-medium">Traders</span>
              <span className="text-sm text-muted-foreground ml-auto">
                {dataCounts?.synced_traders || 0} / {dataCounts?.total_traders || 0} synced
              </span>
            </div>
            <Progress 
              value={dataCounts?.total_traders ? (dataCounts.synced_traders / dataCounts.total_traders) * 100 : 0} 
              className="h-2"
            />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                <span className="text-muted-foreground">With Risk Score</span>
                <Badge variant={dataCounts?.traders_with_risk_score ? "default" : "secondary"}>
                  {dataCounts?.traders_with_risk_score || 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                <span className="text-muted-foreground">With Advanced Metrics</span>
                <Badge variant={dataCounts?.traders_with_metrics ? "default" : "secondary"}>
                  {dataCounts?.traders_with_metrics || 0}
                </Badge>
              </div>
            </div>
          </div>

          {/* Portfolio Data */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg border bg-card text-center">
              <div className="text-2xl font-bold text-primary">{dataCounts?.total_holdings || 0}</div>
              <div className="text-xs text-muted-foreground">Holdings</div>
            </div>
            <div className="p-3 rounded-lg border bg-card text-center">
              <div className="text-2xl font-bold text-primary">{dataCounts?.total_trades || 0}</div>
              <div className="text-xs text-muted-foreground">Trades</div>
            </div>
            <div className="p-3 rounded-lg border bg-card text-center">
              <div className="text-2xl font-bold text-primary">{dataCounts?.total_assets || 0}</div>
              <div className="text-xs text-muted-foreground">Assets</div>
            </div>
            <div className="p-3 rounded-lg border bg-card text-center">
              <div className="text-2xl font-bold text-primary">{dataCounts?.total_posts || 0}</div>
              <div className="text-xs text-muted-foreground">Posts</div>
            </div>
          </div>

          {/* Performance Data Warning */}
          {dataCounts?.total_performance === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600">
              <Activity className="h-4 w-4" />
              <span className="text-sm">Monthly performance data not yet synced (Bullaware API returns 404)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync State Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Sync Pipeline Status
          </CardTitle>
          <CardDescription>Real-time sync progress from the continuous worker</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {syncStates?.map((state) => (
              <div key={state.id} className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium capitalize">{state.id.replace('_', ' ')}</h4>
                  <Badge className={getStatusColor(state.status)}>
                    {state.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>Last run: {formatRelativeTime(state.last_run)}</div>
                  {state.total_pages && (
                    <>
                      <div>Page: {state.last_page} / {state.total_pages}</div>
                      <Progress 
                        value={(state.last_page / state.total_pages) * 100} 
                        className="h-1.5 mt-2"
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Manual Sync
          </CardTitle>
          <CardDescription>
            Trigger the sync worker manually (it runs automatically every 2 min)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
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
              Trigger Sync Worker
            </Button>
            <Button onClick={syncAll} variant="outline" className="flex-1">
              Sync All (3 cycles)
            </Button>
          </div>
          {syncStatus.worker.message && (
            <p className={`text-sm ${syncStatus.worker.success ? 'text-green-600' : 'text-destructive'}`}>
              {syncStatus.worker.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sync Options */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Scraping Options
          </CardTitle>
          <CardDescription>Configure Firecrawl-based scraping (posts use credits)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Enable Cross-Checking (Firecrawl)
              </Label>
              <p className="text-sm text-muted-foreground">
                Validates data by comparing Bullaware with eToro. Uses ~20 credits.
              </p>
            </div>
            <Switch
              checked={options.enableCrossCheck}
              onCheckedChange={(checked) => setOptions(prev => ({ ...prev, enableCrossCheck: checked }))}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Post Scraping Limit
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
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              Each trader uses ~1 Firecrawl credit. Set to 0 to skip post scraping.
            </p>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Est. time: <strong>{estimateTime()}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Est. credits: <strong>~{estimateCredits()}</strong></span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Sync Functions */}
      <div className="grid gap-4">
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-secondary">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">Scrape Posts</h3>
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Firecrawl
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Scrape social posts from eToro ({options.postLimit} traders)
                </p>
                {syncStatus.posts.message && (
                  <p className={`text-xs mt-1 ${syncStatus.posts.success ? 'text-green-600' : 'text-destructive'}`}>
                    {syncStatus.posts.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {syncStatus.posts.success === true && <CheckCircle className="h-5 w-5 text-green-600" />}
              {syncStatus.posts.success === false && <XCircle className="h-5 w-5 text-destructive" />}
              <Button 
                onClick={syncPosts} 
                disabled={syncStatus.posts.isLoading || options.postLimit === 0}
                variant="outline"
              >
                {syncStatus.posts.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Run'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-secondary">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium">Scrape Daily Movers</h3>
                <p className="text-sm text-muted-foreground">Fetch trending assets</p>
                {syncStatus.dailyMovers.message && (
                  <p className={`text-xs mt-1 ${syncStatus.dailyMovers.success ? 'text-green-600' : 'text-destructive'}`}>
                    {syncStatus.dailyMovers.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {syncStatus.dailyMovers.success === true && <CheckCircle className="h-5 w-5 text-green-600" />}
              {syncStatus.dailyMovers.success === false && <XCircle className="h-5 w-5 text-destructive" />}
              <Button 
                onClick={syncDailyMovers} 
                disabled={syncStatus.dailyMovers.isLoading}
                variant="outline"
              >
                {syncStatus.dailyMovers.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Run'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
