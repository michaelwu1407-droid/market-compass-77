import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Users, Briefcase, FileText, TrendingUp, CheckCircle, XCircle, Zap, Shield, Clock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

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

export default function AdminSyncPage() {
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({
    traders: { isLoading: false, success: null, message: null },
    assets: { isLoading: false, success: null, message: null },
    traderDetails: { isLoading: false, success: null, message: null },
    posts: { isLoading: false, success: null, message: null },
    dailyMovers: { isLoading: false, success: null, message: null },
  });

  const [options, setOptions] = useState<SyncOptions>({
    enableCrossCheck: false,
    force: false,
    postLimit: 5,
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
      
      updateStatus(name, { 
        isLoading: false, 
        success: true, 
        message: data?.message || `Synced successfully` 
      });
      toast({ title: 'Success', description: `${functionName} completed` });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateStatus(name, { isLoading: false, success: false, message: errorMessage });
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const syncTraders = () => syncFunction('traders', 'sync-traders', {
    enableCrossCheck: options.enableCrossCheck,
    force: options.force,
  });

  const syncAssets = () => syncFunction('assets', 'sync-assets');

  const syncTraderDetails = () => syncFunction('traderDetails', 'sync-trader-details', {
    enableCrossCheck: options.enableCrossCheck,
    force: options.force,
  });

  const syncPosts = () => syncFunction('posts', 'scrape-posts', {
    traderLimit: options.postLimit,
  });

  const syncDailyMovers = () => syncFunction('dailyMovers', 'scrape-daily-movers');

  const syncAll = async () => {
    await syncTraders();
    await syncAssets();
    await syncTraderDetails();
    if (options.postLimit > 0) {
      await syncPosts();
    }
    await syncDailyMovers();
  };

  // Estimate time based on options
  const estimateTime = () => {
    let seconds = 5; // Base time
    if (options.enableCrossCheck) seconds += 120; // Firecrawl is slow
    if (options.force) seconds += 30;
    if (options.postLimit > 0) seconds += options.postLimit * 10;
    return seconds < 60 ? `~${seconds}s` : `~${Math.ceil(seconds / 60)}m`;
  };

  // Estimate Firecrawl credits
  const estimateCredits = () => {
    let credits = 0;
    if (options.enableCrossCheck) credits += 20; // ~1 per trader for cross-check
    credits += options.postLimit; // 1 per trader for posts
    return credits;
  };

  const syncButtons = [
    { 
      key: 'traders', 
      name: 'Sync Traders', 
      fn: syncTraders, 
      icon: Users, 
      desc: 'Fetch trader profiles from Bullaware',
      usesFirecrawl: options.enableCrossCheck,
    },
    { 
      key: 'assets', 
      name: 'Sync Assets', 
      fn: syncAssets, 
      icon: Briefcase, 
      desc: 'Fetch asset data from Bullaware',
      usesFirecrawl: false,
    },
    { 
      key: 'traderDetails', 
      name: 'Sync Trader Details', 
      fn: syncTraderDetails, 
      icon: FileText, 
      desc: 'Fetch holdings & performance for each trader',
      usesFirecrawl: options.enableCrossCheck,
    },
    { 
      key: 'posts', 
      name: 'Scrape Posts', 
      fn: syncPosts, 
      icon: FileText, 
      desc: `Scrape social posts from eToro (${options.postLimit} traders)`,
      usesFirecrawl: true,
      disabled: options.postLimit === 0,
    },
    { 
      key: 'dailyMovers', 
      name: 'Scrape Daily Movers', 
      fn: syncDailyMovers, 
      icon: TrendingUp, 
      desc: 'Fetch trending assets',
      usesFirecrawl: false,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Admin: Data Sync</h1>
        <p className="text-muted-foreground">Trigger data sync functions to populate the database</p>
      </div>

      {/* Sync Options */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Sync Options
          </CardTitle>
          <CardDescription>Configure sync behavior to optimize speed and save Firecrawl credits</CardDescription>
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

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Force Full Refresh
              </Label>
              <p className="text-sm text-muted-foreground">
                Sync all traders instead of only stale ones. Slower but ensures everything is updated.
              </p>
            </div>
            <Switch
              checked={options.force}
              onCheckedChange={(checked) => setOptions(prev => ({ ...prev, force: checked }))}
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

      {/* Quick Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>Run all sync functions in sequence</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={syncAll} size="lg" className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync All Data
          </Button>
        </CardContent>
      </Card>

      {/* Individual Sync Buttons */}
      <div className="grid gap-4">
        {syncButtons.map(({ key, name, fn, icon: Icon, desc, usesFirecrawl, disabled }) => {
          const status = syncStatus[key];
          return (
            <Card key={key} className={disabled ? 'opacity-50' : ''}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{name}</h3>
                      {usesFirecrawl && (
                        <Badge variant="outline" className="text-xs">
                          <Zap className="h-3 w-3 mr-1" />
                          Firecrawl
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                    {status.message && (
                      <p className={`text-xs mt-1 ${status.success ? 'text-green-600' : 'text-destructive'}`}>
                        {status.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {status.success === true && <CheckCircle className="h-5 w-5 text-green-600" />}
                  {status.success === false && <XCircle className="h-5 w-5 text-destructive" />}
                  <Button 
                    onClick={() => fn()} 
                    disabled={status.isLoading || disabled}
                    variant="outline"
                  >
                    {status.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Run'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
