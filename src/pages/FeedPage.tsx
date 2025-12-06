import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeedCard } from '@/components/feed/FeedCard';
import { TraderMiniCard } from '@/components/feed/TraderMiniCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { feedItems, traders, followedTraderIds } from '@/data/mockData';
import { useIsMobile } from '@/hooks/use-mobile';
import type { FeedItem } from '@/types';

type FilterType = 'all' | 'following' | 'assets' | 'traders' | 'saved';

export default function FeedPage() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const followedTraders = traders.filter(t => followedTraderIds.includes(t.id));

  const handleViewTrader = (traderId: string) => {
    navigate(`/traders/${traderId}`);
  };

  const handleViewAsset = (assetId: string) => {
    // For now, navigate to analysis with asset pre-filled
    navigate('/analysis');
  };

  const handleAnalyse = (item: FeedItem) => {
    navigate('/analysis');
  };

  const handleStarForIC = (item: FeedItem) => {
    navigate('/ic');
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Discussion Feed</h1>
        <p className="text-muted-foreground">Posts, trades, and trending assets from your network</p>
      </div>

      {/* Filters */}
      <div className="mb-6 overflow-x-auto scrollbar-hide -mx-4 px-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="following">Following</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="traders">Traders</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex gap-6">
        {/* Left Sidebar - Desktop only */}
        {!isMobile && (
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="font-semibold mb-3 text-sm">Traders You Follow</h3>
                <div className="space-y-1">
                  {followedTraders.map(trader => (
                    <TraderMiniCard
                      key={trader.id}
                      trader={trader}
                      isFollowing
                      onClick={() => handleViewTrader(trader.id)}
                    />
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="w-full mt-3" onClick={() => navigate('/traders')}>
                  Discover more traders
                </Button>
              </div>
            </div>
          </aside>
        )}

        {/* Main Feed */}
        <div className="flex-1 min-w-0">
          <div className="space-y-4">
            {feedItems.map((item) => (
              <FeedCard
                key={item.id}
                item={item}
                onViewTrader={handleViewTrader}
                onViewAsset={handleViewAsset}
                onAnalyse={handleAnalyse}
                onStarForIC={handleStarForIC}
              />
            ))}
          </div>
        </div>

        {/* Right Context Panel - Desktop only */}
        {!isMobile && (
          <aside className="w-80 flex-shrink-0 hidden xl:block">
            <div className="sticky top-24">
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="font-semibold mb-3 text-sm text-muted-foreground">Quick Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Feed items today</span>
                    <span className="font-medium">{feedItems.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Traders followed</span>
                    <span className="font-medium">{followedTraders.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">New trades</span>
                    <span className="font-medium text-primary">4</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
