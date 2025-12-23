import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Users, Briefcase, FileText, TrendingUp, CheckCircle, XCircle } from 'lucide-react';

interface SyncStatus {
  isLoading: boolean;
  success: boolean | null;
  message: string | null;
}

export default function AdminSyncPage() {
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({
    traders: { isLoading: false, success: null, message: null },
    assets: { isLoading: false, success: null, message: null },
    traderDetails: { isLoading: false, success: null, message: null },
    posts: { isLoading: false, success: null, message: null },
    dailyMovers: { isLoading: false, success: null, message: null },
  });

  const updateStatus = (key: string, status: Partial<SyncStatus>) => {
    setSyncStatus(prev => ({
      ...prev,
      [key]: { ...prev[key], ...status },
    }));
  };

  const syncFunction = async (name: string, functionName: string) => {
    updateStatus(name, { isLoading: true, success: null, message: null });
    
    try {
      const { data, error } = await supabase.functions.invoke(functionName);
      
      if (error) throw error;
      
      updateStatus(name, { 
        isLoading: false, 
        success: true, 
        message: data?.message || 'Sync completed successfully' 
      });
      toast({ title: 'Success', description: `${functionName} completed` });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateStatus(name, { isLoading: false, success: false, message: errorMessage });
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const syncAll = async () => {
    await syncFunction('traders', 'sync-traders');
    await syncFunction('assets', 'sync-assets');
    await syncFunction('traderDetails', 'sync-trader-details');
    await syncFunction('posts', 'scrape-posts');
    await syncFunction('dailyMovers', 'scrape-daily-movers');
  };

  const syncButtons = [
    { key: 'traders', name: 'Sync Traders', fn: 'sync-traders', icon: Users, desc: 'Fetch trader profiles from Bullaware' },
    { key: 'assets', name: 'Sync Assets', fn: 'sync-assets', icon: Briefcase, desc: 'Fetch asset data from Bullaware' },
    { key: 'traderDetails', name: 'Sync Trader Details', fn: 'sync-trader-details', icon: FileText, desc: 'Fetch holdings & performance for each trader' },
    { key: 'posts', name: 'Scrape Posts', fn: 'scrape-posts', icon: FileText, desc: 'Scrape social posts from eToro' },
    { key: 'dailyMovers', name: 'Scrape Daily Movers', fn: 'scrape-daily-movers', icon: TrendingUp, desc: 'Fetch trending assets' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Admin: Data Sync</h1>
        <p className="text-muted-foreground">Trigger data sync functions to populate the database</p>
      </div>

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

      <div className="grid gap-4">
        {syncButtons.map(({ key, name, fn, icon: Icon, desc }) => {
          const status = syncStatus[key];
          return (
            <Card key={key}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{name}</h3>
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
                    onClick={() => syncFunction(key, fn)} 
                    disabled={status.isLoading}
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
