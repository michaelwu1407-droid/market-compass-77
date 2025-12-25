import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, Play, RotateCcw, CheckCircle2, XCircle, Clock, AlertCircle, Zap, FileText, TrendingUp, Package, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from 'date-fns';

interface QueueItem {
  id: string;
  trader_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  last_attempted_at: string;
  error_message: string;
  retry_count: number;
}

interface SyncState {
  id: string;
  last_run: string;
  status: string;
  updated_at: string;
}

export default function AdminSyncPage() {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncingAssets, setIsSyncingAssets] = useState(false);
  const [isSyncingMovers, setIsSyncingMovers] = useState(false);
  const [isSyncingPosts, setIsSyncingPosts] = useState(false);

  // Hardcoded project URL
  const PROJECT_URL = 'https://xgvaibxxiwfraklfbwey.supabase.co';
  // Fallback for missing env var to prevent crash on page load
  const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const invokeFunction = async (functionName: string, body = {}) => {
    if (!ANON_KEY) {
        throw new Error("Missing VITE_SUPABASE_ANON_KEY in environment variables");
    }
    const res = await fetch(`${PROJECT_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  };

  // 1. Fetch Sync States (Last Run times)
  const { data: syncStates } = useQuery({
    queryKey: ['sync-states'],
    queryFn: async () => {
      const { data } = await supabase.from('sync_state').select('*');
      return data as SyncState[];
    },
    refetchInterval: 5000,
  });

  // 2. Fetch Queue Stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sync_queue').select('status');
      if (error) throw error;
      
      const counts = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
      data.forEach(item => {
        if (item.status === 'PENDING') counts.pending++;
        else if (item.status === 'PROCESSING') counts.processing++;
        else if (item.status === 'COMPLETED') counts.completed++;
        else if (item.status === 'FAILED') counts.failed++;
      });
      counts.total = data.length;
      return counts;
    },
    refetchInterval: 5000,
  });

  // 3. Fetch Queue List
  const { data: queueItems, refetch: refetchQueue } = useQuery({
    queryKey: ['queue-items'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_queue')
        .select('*')
        .order('last_attempted_at', { ascending: false, nullsFirst: true })
        .limit(20);
      return data as QueueItem[];
    },
    refetchInterval: 5000,
  });

  // Calculations for Estimates
  const ITEMS_PER_HOUR = 60; // Estimated based on 10 req/min limit (approx 1 min per trader incl delays)
  const estimatedHoursLeft = stats ? (stats.pending / ITEMS_PER_HOUR).toFixed(1) : 0;
  const progressPct = stats && stats.total > 0 ? ((stats.completed / stats.total) * 100) : 0;

  const getState = (id: string) => syncStates?.find(s => s.id === id);

  // Handlers (kept simple)
  const runDiscovery = async () => {
    setIsDiscovering(true);
    try { await invokeFunction('discover-traders'); toast({ title: 'Discovery Started' }); refetchStats(); } 
    catch (e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); }
    finally { setIsDiscovering(false); }
  };

  const runProcessing = async () => {
    setIsProcessing(true);
    try { await invokeFunction('process-queue'); toast({ title: 'Processing Batch Started' }); refetchStats(); }
    catch (e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); }
    finally { setIsProcessing(false); }
  };

  const syncAssets = async () => { setIsSyncingAssets(true); try { await invokeFunction('sync-assets'); toast({ title: 'Assets Sync Started' }); } catch(e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); } finally { setIsSyncingAssets(false); } };
  const syncDailyMovers = async () => { setIsSyncingMovers(true); try { await invokeFunction('scrape-daily-movers'); toast({ title: 'Movers Sync Started' }); } catch(e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); } finally { setIsSyncingMovers(false); } };
  const syncPosts = async () => { setIsSyncingPosts(true); try { await invokeFunction('scrape-posts'); toast({ title: 'Feed Sync Started' }); } catch(e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); } finally { setIsSyncingPosts(false); } };

  // Action: Reset Failed
  const resetFailed = async () => {
    try {
      const { error } = await supabase
        .from('sync_queue')
        .update({ status: 'PENDING', error_message: null })
        .eq('status', 'FAILED');
      
      if (error) throw error;
      toast({ title: 'Reset Successful', description: 'Failed items marked as PENDING' });
      refetchStats();
      refetchQueue();
    } catch (error) {
      toast({ title: 'Reset Failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Monitor</h1>
          <p className="text-muted-foreground mt-1">Real-time status of data synchronization pipelines</p>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">System Status</p>
                <div className="flex items-center gap-2 text-xs text-green-500">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Operational
                </div>
            </div>
        </div>
      </div>

      {/* Main Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Traders Pipeline (The Heavy Lifter) */}
        <Card className="border-t-4 border-t-blue-500 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Users className="w-24 h-24" /></div>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>Trader Profiles</span>
                    {isProcessing && <Loader2 className="animate-spin h-4 w-4 text-blue-500" />}
                </CardTitle>
                <CardDescription>Deep profile & portfolio sync</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Queue Progress</span>
                        <span className="font-medium">{stats?.completed || 0} / {stats?.total || 0}</span>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending</p>
                        <p className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Est. Time</p>
                        <p className="text-2xl font-bold text-gray-700">~{estimatedHoursLeft}h</p>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="bg-muted/30 p-3 px-6 flex justify-between items-center">
                <div className="text-xs text-muted-foreground">
                    Last active: {getState('trader_details')?.last_run ? formatDistanceToNow(new Date(getState('trader_details')!.last_run), { addSuffix: true }) : 'Never'}
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={runDiscovery} disabled={isDiscovering}>
                        {isDiscovering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={runProcessing} disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    </Button>
                </div>
            </CardFooter>
        </Card>

        {/* Market Data Pipeline */}
        <Card className="border-t-4 border-t-green-500 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-24 h-24" /></div>
            <CardHeader>
                <CardTitle>Market Data</CardTitle>
                <CardDescription>Assets, Prices & Movers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg"><Package className="h-5 w-5 text-green-600" /></div>
                        <div>
                            <p className="font-medium">Assets</p>
                            <p className="text-xs text-muted-foreground">
                                Last: {getState('assets')?.last_run ? formatDistanceToNow(new Date(getState('assets')!.last_run), { addSuffix: true }) : 'Never'}
                            </p>
                        </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={syncAssets} disabled={isSyncingAssets}>
                        {isSyncingAssets ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sync'}
                    </Button>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
                        <div>
                            <p className="font-medium">Daily Movers</p>
                            <p className="text-xs text-muted-foreground">
                                Last: {getState('daily_movers')?.last_run ? formatDistanceToNow(new Date(getState('daily_movers')!.last_run), { addSuffix: true }) : 'Never'}
                            </p>
                        </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={syncDailyMovers} disabled={isSyncingMovers}>
                        {isSyncingMovers ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sync'}
                    </Button>
                </div>
            </CardContent>
        </Card>

        {/* Social Pipeline */}
        <Card className="border-t-4 border-t-pink-500 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><FileText className="w-24 h-24" /></div>
            <CardHeader>
                <CardTitle>Social Feed</CardTitle>
                <CardDescription>Discussions & Sentiment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Sync Status</p>
                            <div className="flex items-center gap-2">
                                <div className={`h-2.5 w-2.5 rounded-full ${isSyncingPosts ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>
                                <span className="text-xs text-muted-foreground">{isSyncingPosts ? 'Syncing...' : 'Idle'}</span>
                            </div>
                        </div>
                        <Button size="sm" onClick={syncPosts} disabled={isSyncingPosts}>
                            {isSyncingPosts ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                            Sync Now
                        </Button>
                    </div>
                    
                    <div className="rounded-lg bg-muted p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <Clock className="h-3 w-3" />
                            <span>Schedule: Every 10 mins</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Last run: {getState('posts')?.last_run ? formatDistanceToNow(new Date(getState('posts')!.last_run), { addSuffix: true }) : 'Unknown'}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
      </div>

      {/* Queue Details Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
                <CardTitle>Active Queue</CardTitle>
                <CardDescription>Live view of the trader synchronization queue</CardDescription>
            </div>
            {stats?.failed > 0 && (
                <Button variant="outline" size="sm" onClick={resetFailed} className="text-red-500 hover:text-red-600">
                  <RotateCcw className="h-3 w-3 mr-2" /> Retry {stats.failed} Failed
                </Button>
            )}
          </div>
        </CardHeader>
        <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trader ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Last Attempted</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueItems && queueItems.length > 0 ? (
                  queueItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono font-medium">{item.trader_id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                            item.status === 'COMPLETED' ? 'bg-green-100 text-green-700 border-green-200' :
                            item.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            item.status === 'FAILED' ? 'bg-red-100 text-red-700 border-red-200' :
                            'bg-gray-100 text-gray-700'
                        }>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.retry_count}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {item.last_attempted_at ? formatDistanceToNow(new Date(item.last_attempted_at), { addSuffix: true }) : '-'}
                      </TableCell>
                      <TableCell className="text-red-500 text-xs max-w-[300px] truncate" title={item.error_message}>
                        {item.error_message || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      Queue is empty.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
        </div>
      </Card>
    </div>
  );
}
