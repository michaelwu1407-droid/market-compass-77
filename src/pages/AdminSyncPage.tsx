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

// Matches the status strings in the 'sync_jobs' table
type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

interface QueueItem {
  id: string;
  trader_id: string;
  status: SyncStatus;
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

  const PROJECT_URL = 'https://xgvaibxxiwfraklfbwey.supabase.co';
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

  const { data: syncStates } = useQuery({
    queryKey: ['sync-states'],
    queryFn: async () => {
      const { data } = await supabase.from('sync_state').select('*');
      return data as SyncState[];
    },
    refetchInterval: 5000,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['job-stats'], // Changed queryKey to reflect new source
    queryFn: async () => {
      const { data, error } = await supabase.from('sync_jobs').select('status');
      if (error) throw error;
      
      const counts = { pending: 0, in_progress: 0, completed: 0, failed: 0, total: 0 };
      data.forEach(item => {
        if (item.status === 'pending') counts.pending++;
        else if (item.status === 'in_progress') counts.in_progress++;
        else if (item.status === 'completed') counts.completed++;
        else if (item.status === 'failed') counts.failed++;
      });
      counts.total = data.length;
      return counts;
    },
    refetchInterval: 5000,
  });

  const { data: queueItems, refetch: refetchQueue } = useQuery({
    queryKey: ['job-items'], // Changed queryKey to reflect new source
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_jobs')
        .select('*')
        .order('last_attempted_at', { ascending: false, nullsFirst: true })
        .limit(20);
      return data as QueueItem[];
    },
    refetchInterval: 5000,
  });

  const ITEMS_PER_HOUR = 60;
  const estimatedHoursLeft = stats ? (stats.pending / ITEMS_PER_HOUR).toFixed(1) : 0;
  const progressPct = stats && stats.total > 0 ? ((stats.completed / stats.total) * 100) : 0;

  const getState = (id: string) => syncStates?.find(s => s.id === id);

  const runDiscovery = async () => {
    setIsDiscovering(true);
    try {
      // Corrected: calling 'enqueue-sync-jobs' with correct parameters
      await invokeFunction('enqueue-sync-jobs', { sync_traders: true, force: true }); 
      toast({ title: 'Full Sync Started', description: 'Populating sync jobs for all traders.' }); 
      refetchStats(); 
    } 
    catch (e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); }
    finally { setIsDiscovering(false); }
  };

  const runProcessing = async () => {
    setIsProcessing(true);
    try {
      // Corrected to call the function that processes the queue
      await invokeFunction('dispatch-sync-jobs'); 
      toast({ title: 'Processing Batch Started' }); 
      refetchStats(); 
    }
    catch (e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); }
    finally { setIsProcessing(false); }
  };

  // These functions remain as they are, assuming they are correct
  const syncAssets = async () => { setIsSyncingAssets(true); try { await invokeFunction('sync-assets'); toast({ title: 'Assets Sync Started' }); } catch(e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); } finally { setIsSyncingAssets(false); } };
  const syncDailyMovers = async () => { setIsSyncingMovers(true); try { await invokeFunction('scrape-daily-movers'); toast({ title: 'Movers Sync Started' }); } catch(e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); } finally { setIsSyncingMovers(false); } };
  const syncPosts = async () => { setIsSyncingPosts(true); try { await invokeFunction('scrape-posts'); toast({ title: 'Feed Sync Started' }); } catch(e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); } finally { setIsSyncingPosts(false); } };

  const resetFailed = async () => {
    try {
      const { error } = await supabase
        .from('sync_jobs') // Corrected table name
        .update({ status: 'pending', error_message: null, retry_count: 0 })
        .eq('status', 'failed');
      
      if (error) throw error;
      toast({ title: 'Reset Successful', description: 'Failed jobs marked as pending' });
      refetchStats();
      refetchQueue();
    } catch (error) {
      toast({ title: 'Reset Failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Monitor</h1>
          <p className="text-muted-foreground mt-1">Real-time status of data synchronization pipelines</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <Card className="border-t-4 border-t-blue-500 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Users className="w-24 h-24" /></div>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>Trader Profiles</span>
                    {(isProcessing || (stats?.in_progress ?? 0) > 0) && <Loader2 className="animate-spin h-4 w-4 text-blue-500" />}
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
                    <Button title="Start Full Sync" size="sm" variant="ghost" onClick={runDiscovery} disabled={isDiscovering}>
                        {isDiscovering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button title="Dispatch Batch" size="sm" variant="ghost" onClick={runProcessing} disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    </Button>
                </div>
            </CardFooter>
        </Card>

        {/* These cards remain unchanged for now */}
        <Card className="border-t-4 border-t-green-500 shadow-sm relative overflow-hidden">
           {/* ... content ... */}
        </Card>
        <Card className="border-t-4 border-t-pink-500 shadow-sm relative overflow-hidden">
           {/* ... content ... */}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
                <CardTitle>Active Sync Jobs</CardTitle>
                <CardDescription>Live view of the trader synchronization jobs</CardDescription>
            </div>
            {(stats?.failed ?? 0) > 0 && (
                <Button variant="outline" size="sm" onClick={resetFailed} className="text-red-500 hover:text-red-600">
                  <RotateCcw className="h-3 w-3 mr-2" /> Retry {stats?.failed} Failed
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
                            item.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                            item.status === 'in_progress' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            item.status === 'failed' ? 'bg-red-100 text-red-700 border-red-200' :
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
                      No active jobs. Run the 'Full Sync' to begin.
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
