import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Clock } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TraderCard } from '@/components/traders/TraderCard';
import { useTraders } from '@/hooks/useTraders';
import { useFollowedTraders } from '@/hooks/useFollowedTraders';
import { useAuth } from '@/contexts/AuthContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

type TraderFilter = 'trending' | 'most_copied' | 'following';

export default function TradersPage() {
  const [filter, setFilter] = useState<TraderFilter>('trending');
  const [minTrackRecord, setMinTrackRecord] = useState('12m');
  const [maxRisk, setMaxRisk] = useState([7]);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ref, inView } = useInView();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    refetch
  } = useTraders();
  const { followedTraderIds, isFollowing, toggleFollow } = useFollowedTraders();

  const allTraders = useMemo(() => data?.pages.flatMap(page => page.data) ?? [], [data]);

  // Effect to fetch next page when user scrolls to the bottom
  React.useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  const lastSyncTime = useMemo(() => {
    return allTraders?.reduce((latest, trader) => {
      if (trader.details_synced_at) {
        const syncDate = new Date(trader.details_synced_at);
        return syncDate > latest ? syncDate : latest;
      }
      return latest;
    }, new Date(0));
  }, [allTraders]);

  const handleRefresh = async () => {
    await refetch();
    toast({ title: 'Refreshed', description: 'Trader data has been refreshed.' });
  };

  const handleAnalyse = (traderId: string) => navigate(`/analysis?trader=${traderId}`);

  const handleStarForIC = async (traderId: string) => {
    const trader = allTraders?.find(t => t.id === traderId);
    const title = trader ? `${trader.display_name} Analysis` : 'Trader Analysis';
    const { error } = await supabase.from('reports').insert({ title, report_type: 'trader_portfolio', input_trader_ids: [traderId], starred_for_ic: true, status: 'to_review' }).select().single();
    if (error) {
      toast({ title: 'Error', description: 'Failed to add to IC', variant: 'destructive' });
      return;
    }
    toast({ title: 'Added to IC', description: 'Trader added to Investment Committee review' });
    navigate('/ic');
  };

  const filteredTraders = useMemo(() => {
    let traders = [...(allTraders || [])];
    if (filter === 'following') {
      traders = traders.filter(t => followedTraderIds.includes(t.id));
    } else if (filter === 'most_copied') {
      traders.sort((a, b) => (b.copiers || 0) - (a.copiers || 0));
    }
    return traders.filter(t => (t.risk_score || 0) <= maxRisk[0]);
  }, [allTraders, filter, followedTraderIds, maxRisk]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Copy Traders</h1>
          <p className="text-muted-foreground">Discover and analyse top investor profiles</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="max-w-6xl mx-auto text-center py-12"><p className="text-destructive">Error loading traders: {error.message}</p></div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Copy Traders</h1>
            <p className="text-muted-foreground text-sm">Discover and analyse top investor profiles</p>
          </div>
          <div className="flex items-center gap-3">
            {lastSyncTime && lastSyncTime.getTime() > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="hidden sm:inline">Data synced:</span>
                <span>{formatDistanceToNow(lastSyncTime, { addSuffix: true })}</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching && !isFetchingNextPage}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching && !isFetchingNextPage ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto scrollbar-hide -mx-4 px-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as TraderFilter)}>
          <TabsList>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="most_copied">Most Copied</TabsTrigger>
            <TabsTrigger value="following">Following ({followedTraderIds.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 p-4 bg-card rounded-lg border border-border">
        <div className="space-y-2"><Label className="text-xs">Minimum Track Record</Label><Select value={minTrackRecord} onValueChange={setMinTrackRecord}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="6m">6 months</SelectItem><SelectItem value="12m">12 months</SelectItem><SelectItem value="24m">24 months</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label className="text-xs">Max Risk Score: {maxRisk[0]}</Label><Slider value={maxRisk} onValueChange={setMaxRisk} max={10} min={1} step={1} className="mt-3" /></div>
        <div className="space-y-2"><Label className="text-xs">Strategy Tags</Label><Select><SelectTrigger><SelectValue placeholder="All strategies" /></SelectTrigger><SelectContent><SelectItem value="all">All strategies</SelectItem><SelectItem value="growth">Growth</SelectItem><SelectItem value="value">Value</SelectItem><SelectItem value="dividends">Dividends</SelectItem><SelectItem value="momentum">Momentum</SelectItem></SelectContent></Select></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTraders.map((trader) => (
          <TraderCard key={trader.id} trader={trader} isFollowing={isFollowing(trader.id)} onFollow={() => toggleFollow(trader.id)} onAnalyse={() => handleAnalyse(trader.id)} onStarForIC={() => handleStarForIC(trader.id)} />
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <Button ref={ref} onClick={() => fetchNextPage()} disabled={!hasNextPage || isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading more...' : hasNextPage ? 'Load More' : 'Nothing more to load'}
        </Button>
      </div>

      {filteredTraders.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No traders match your filters</p>
          {allTraders.length === 0 && <p className="text-sm mt-2">Run the sync-traders edge function to populate data from Bullaware</p>}
        </div>
      )}
    </div>
  );
}
