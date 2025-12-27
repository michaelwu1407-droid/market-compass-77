import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { lovableCloud } from '@/lib/lovableCloud';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { 
  Loader2, Play, CheckCircle2, XCircle, Clock, AlertCircle, 
  Zap, MessageSquare, Users, TrendingUp, RefreshCw, ChevronDown, ChevronUp,
  Gauge, AlertTriangle, Circle, Pause
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow, format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type Domain = 'discussion_feed' | 'trader_profiles' | 'stock_data';
type SyncStatus = 'idle' | 'running' | 'queued' | 'error' | 'rate_limited' | 'completed';

interface DomainStatus {
  domain: Domain;
  status: SyncStatus;
  current_run_id: string | null;
  last_successful_at: string | null;
  next_scheduled_at: string | null;
  items_total: number;
  items_completed: number;
  current_stage: string | null;
  eta_seconds: number | null;
  last_error_message: string | null;
  last_error_at: string | null;
  lock_holder: string | null;
  updated_at: string;
}

interface RateLimitInfo {
  id: string;
  requests_this_minute: number;
  max_per_minute: number;
  minute_started_at: string;
  next_reset_at: string | null;
}

interface SyncLog {
  id: string;
  run_id: string | null;
  domain: string;
  level: string;
  message: string;
  details: any;
  created_at: string;
}

interface SyncDatapoint {
  id: string;
  run_id: string;
  domain: string;
  datapoint_key: string;
  datapoint_label: string;
  value_current: number;
  value_total: number | null;
  status: string;
  details: any;
  updated_at: string;
}

const DOMAIN_CONFIG: Record<Domain, { label: string; icon: React.ElementType; color: string; description: string }> = {
  discussion_feed: {
    label: 'Discussion Feed',
    icon: MessageSquare,
    color: 'pink',
    description: 'eToro Popular Investors feed posts',
  },
  trader_profiles: {
    label: 'Trader Profiles',
    icon: Users,
    color: 'blue',
    description: 'BullAware API - Deep profile & portfolio sync',
  },
  stock_data: {
    label: 'Stock Data',
    icon: TrendingUp,
    color: 'green',
    description: 'Yahoo Finance & other sources',
  },
};

const STATUS_CONFIG: Record<SyncStatus, { label: string; color: string; icon: React.ElementType }> = {
  idle: { label: 'Idle', color: 'bg-muted text-muted-foreground', icon: Clock },
  running: { label: 'Running', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: Loader2 },
  queued: { label: 'Queued', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: Clock },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: CheckCircle2 },
  error: { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: XCircle },
  rate_limited: { label: 'Rate Limited', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', icon: AlertTriangle },
};

const DATAPOINT_STATUS_ICON: Record<string, React.ElementType> = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle,
  info: Circle,
  rate_limited: Pause,
};

function formatEta(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '-';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function DatapointRow({ datapoint }: { datapoint: SyncDatapoint }) {
  const StatusIcon = DATAPOINT_STATUS_ICON[datapoint.status] || Circle;
  const isRunning = datapoint.status === 'running';
  const isError = datapoint.status === 'error';
  const isCompleted = datapoint.status === 'completed';
  
  const progress = datapoint.value_total && datapoint.value_total > 0 
    ? (datapoint.value_current / datapoint.value_total) * 100 
    : null;

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-sm">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <StatusIcon className={cn(
          "h-3.5 w-3.5 shrink-0",
          isRunning && "animate-spin text-blue-500",
          isError && "text-red-500",
          isCompleted && "text-green-500",
          !isRunning && !isError && !isCompleted && "text-muted-foreground"
        )} />
        <span className="truncate">{datapoint.datapoint_label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {progress !== null ? (
          <div className="flex items-center gap-2">
            <Progress value={progress} className="w-16 h-1.5" />
            <span className="text-xs text-muted-foreground w-16 text-right">
              {datapoint.value_current}/{datapoint.value_total}
            </span>
          </div>
        ) : (
          <span className={cn(
            "font-medium tabular-nums",
            isError && "text-red-600",
            isCompleted && "text-green-600"
          )}>
            {datapoint.value_current}
          </span>
        )}
      </div>
    </div>
  );
}

function DomainPanel({ 
  domain, 
  status, 
  rateLimit,
  logs,
  datapoints,
  onTriggerSync,
  isSyncing,
}: {
  domain: Domain;
  status: DomainStatus | undefined;
  rateLimit: RateLimitInfo | undefined;
  logs: SyncLog[];
  datapoints: SyncDatapoint[];
  onTriggerSync: (domain: Domain) => void;
  isSyncing: boolean;
}) {
  const [logsOpen, setLogsOpen] = useState(false);
  const config = DOMAIN_CONFIG[domain];
  const Icon = config.icon;
  const currentStatus = status?.status || 'idle';
  const statusConfig = STATUS_CONFIG[currentStatus];
  const StatusIcon = statusConfig.icon;
  
  const progress = status?.items_total && status.items_total > 0 
    ? (status.items_completed / status.items_total) * 100 
    : 0;

  const borderColor = {
    pink: 'border-t-pink-500',
    blue: 'border-t-blue-500',
    green: 'border-t-green-500',
  }[config.color];

  // Get latest datapoints for current run
  const currentDatapoints = datapoints.filter(dp => 
    dp.run_id === status?.current_run_id || 
    (status?.status === 'idle' && datapoints.length > 0)
  );

  return (
    <Card className={cn("border-t-4 shadow-sm relative overflow-hidden", borderColor)}>
      <div className="absolute top-0 right-0 p-4 opacity-5">
        <Icon className="w-24 h-24" />
      </div>
      
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {config.label}
          </CardTitle>
          <Badge className={cn("gap-1", statusConfig.color)}>
            <StatusIcon className={cn("h-3 w-3", currentStatus === 'running' && "animate-spin")} />
            {statusConfig.label}
          </Badge>
        </div>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar for running status */}
        {currentStatus === 'running' && status?.items_total && status.items_total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{status?.items_completed || 0} / {status?.items_total || 0}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Current Stage */}
        {status?.current_stage && (
          <div className="text-sm p-2 bg-muted/50 rounded">
            <span className="text-muted-foreground">Current: </span>
            <span className="font-medium">{status.current_stage}</span>
          </div>
        )}

        {/* Granular Datapoints */}
        {currentDatapoints.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Datapoints
            </div>
            <div className="divide-y divide-border/50">
              {currentDatapoints.map(dp => (
                <DatapointRow key={dp.id} datapoint={dp} />
              ))}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Refresh</p>
            <p className="font-medium">
              {status?.last_successful_at 
                ? formatDistanceToNow(new Date(status.last_successful_at), { addSuffix: true })
                : 'Never'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">ETA</p>
            <p className="font-medium">{formatEta(status?.eta_seconds || null)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Next Scheduled</p>
            <p className="font-medium">
              {status?.next_scheduled_at 
                ? format(new Date(status.next_scheduled_at), 'HH:mm')
                : 'Continuous'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Updated</p>
            <p className="font-medium">
              {status?.updated_at 
                ? formatDistanceToNow(new Date(status.updated_at), { addSuffix: true })
                : '-'}
            </p>
          </div>
        </div>

        {/* Rate Limit Info (only for trader_profiles) */}
        {domain === 'trader_profiles' && rateLimit && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">BullAware Rate Limit</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Used: </span>
                <span className="font-medium">{rateLimit.requests_this_minute}/{rateLimit.max_per_minute}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Remaining: </span>
                <span className={cn("font-medium", 
                  rateLimit.max_per_minute - rateLimit.requests_this_minute <= 2 ? "text-orange-600" : "text-green-600"
                )}>
                  {rateLimit.max_per_minute - rateLimit.requests_this_minute}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Resets: </span>
                <span className="font-medium">
                  {rateLimit.next_reset_at 
                    ? formatDistanceToNow(new Date(rateLimit.next_reset_at), { addSuffix: true })
                    : '~1m'}
                </span>
              </div>
            </div>
            <Progress 
              value={(rateLimit.requests_this_minute / rateLimit.max_per_minute) * 100} 
              className="h-1.5 mt-2" 
            />
          </div>
        )}

        {/* Last Error */}
        {status?.last_error_message && (
          <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-700 dark:text-red-300">Last Error</span>
              {status.last_error_at && (
                <span className="text-xs text-red-500">
                  {formatDistanceToNow(new Date(status.last_error_at), { addSuffix: true })}
                </span>
              )}
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">{status.last_error_message}</p>
          </div>
        )}

        {/* Logs Collapsible */}
        {logs.length > 0 && (
          <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>View Logs ({logs.length})</span>
                {logsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-40 mt-2 rounded border p-2">
                <div className="space-y-1">
                  {logs.map(log => (
                    <div key={log.id} className="text-xs flex gap-2">
                      <span className="text-muted-foreground shrink-0">
                        {format(new Date(log.created_at), 'HH:mm:ss')}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={cn("text-[10px] px-1 py-0 shrink-0",
                          log.level === 'error' && "border-red-500 text-red-600",
                          log.level === 'warn' && "border-yellow-500 text-yellow-600",
                        )}
                      >
                        {log.level}
                      </Badge>
                      <span className="truncate">{log.message}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <CardFooter className="bg-muted/30 p-3 px-6">
        <Button 
          onClick={() => onTriggerSync(domain)} 
          disabled={isSyncing || currentStatus === 'running'}
          size="sm"
          className="w-full"
        >
          {isSyncing || currentStatus === 'running' ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {currentStatus === 'running' ? 'Syncing...' : 'Starting...'}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Sync Now
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function AdminSyncPage() {
  const [syncingDomains, setSyncingDomains] = useState<Set<Domain>>(new Set());
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const queryClient = useQueryClient();

  // Fetch domain statuses
  const { data: domainStatuses } = useQuery({
    queryKey: ['sync-domain-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_domain_status')
        .select('*');
      if (error) throw error;
      return data as DomainStatus[];
    },
    refetchInterval: 3000,
  });

  // Fetch rate limits
  const { data: rateLimits } = useQuery({
    queryKey: ['sync-rate-limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_rate_limits')
        .select('*');
      if (error) throw error;
      return data as RateLimitInfo[];
    },
    refetchInterval: 5000,
  });

  // Fetch recent logs
  const { data: recentLogs } = useQuery({
    queryKey: ['sync-logs-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as SyncLog[];
    },
    refetchInterval: 5000,
  });

  // Fetch datapoints
  const { data: datapoints } = useQuery({
    queryKey: ['sync-datapoints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_datapoints')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as SyncDatapoint[];
    },
    refetchInterval: 3000,
  });

  const getStatusForDomain = (domain: Domain) => 
    domainStatuses?.find(s => s.domain === domain);

  const getRateLimitForDomain = (domain: Domain) => 
    domain === 'trader_profiles' ? rateLimits?.find(r => r.id === 'bullaware') : undefined;

  const getLogsForDomain = (domain: Domain) => 
    (recentLogs || []).filter(l => l.domain === domain).slice(0, 20);

  const getDatapointsForDomain = (domain: Domain) =>
    (datapoints || []).filter(dp => dp.domain === domain);

  const triggerSync = async (domains: Domain[]) => {
    const newSyncing = new Set(syncingDomains);
    domains.forEach(d => newSyncing.add(d));
    setSyncingDomains(newSyncing);

    try {
      // Use Lovable Cloud for function calls (edge functions are deployed there)
      const { data, error } = await lovableCloud.functions.invoke('trigger-sync', {
        body: { domains, triggered_by: 'manual' },
      });

      if (error) throw error;

      const results = data?.results || [];
      for (const result of results) {
        const statusMsg = {
          started: 'Sync started',
          queued: 'Sync queued (another sync in progress)',
          blocked: result.message,
          error: result.message,
        }[result.status] || result.message;

        toast({
          title: `${DOMAIN_CONFIG[result.domain as Domain].label}`,
          description: statusMsg,
          variant: result.status === 'error' ? 'destructive' : 'default',
        });
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['sync-domain-status'] });
      queryClient.invalidateQueries({ queryKey: ['sync-logs-recent'] });
      queryClient.invalidateQueries({ queryKey: ['sync-datapoints'] });

    } catch (err: any) {
      toast({
        title: 'Sync Failed',
        description: err.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSyncingDomains(new Set());
    }
  };

  const handleSyncDomain = (domain: Domain) => {
    triggerSync([domain]);
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    await triggerSync(['discussion_feed', 'trader_profiles', 'stock_data']);
    setIsSyncingAll(false);
  };

  const anyRunning = domainStatuses?.some(s => s.status === 'running');

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sync Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and control data synchronization across all domains
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['sync-domain-status'] });
              queryClient.invalidateQueries({ queryKey: ['sync-rate-limits'] });
              queryClient.invalidateQueries({ queryKey: ['sync-logs-recent'] });
              queryClient.invalidateQueries({ queryKey: ['sync-datapoints'] });
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={handleSyncAll} 
            disabled={isSyncingAll || anyRunning}
          >
            {isSyncingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing All...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Sync All Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Domain Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DomainPanel
          domain="discussion_feed"
          status={getStatusForDomain('discussion_feed')}
          rateLimit={undefined}
          logs={getLogsForDomain('discussion_feed')}
          datapoints={getDatapointsForDomain('discussion_feed')}
          onTriggerSync={handleSyncDomain}
          isSyncing={syncingDomains.has('discussion_feed')}
        />
        <DomainPanel
          domain="trader_profiles"
          status={getStatusForDomain('trader_profiles')}
          rateLimit={getRateLimitForDomain('trader_profiles')}
          logs={getLogsForDomain('trader_profiles')}
          datapoints={getDatapointsForDomain('trader_profiles')}
          onTriggerSync={handleSyncDomain}
          isSyncing={syncingDomains.has('trader_profiles')}
        />
        <DomainPanel
          domain="stock_data"
          status={getStatusForDomain('stock_data')}
          rateLimit={undefined}
          logs={getLogsForDomain('stock_data')}
          datapoints={getDatapointsForDomain('stock_data')}
          onTriggerSync={handleSyncDomain}
          isSyncing={syncingDomains.has('stock_data')}
        />
      </div>

      {/* Recent Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>Latest sync events across all domains</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {(recentLogs || []).slice(0, 50).map(log => (
                <div key={log.id} className="flex items-start gap-3 text-sm py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground shrink-0 w-16">
                    {format(new Date(log.created_at), 'HH:mm:ss')}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={cn("text-[10px] px-1.5 py-0 shrink-0",
                      log.level === 'error' && "border-red-500 text-red-600",
                      log.level === 'warn' && "border-yellow-500 text-yellow-600",
                      log.level === 'info' && "border-blue-500 text-blue-600",
                    )}
                  >
                    {log.level}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                    {DOMAIN_CONFIG[log.domain as Domain]?.label || log.domain}
                  </Badge>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
              {(!recentLogs || recentLogs.length === 0) && (
                <p className="text-muted-foreground text-center py-8">No recent activity</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
