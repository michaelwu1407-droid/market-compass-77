import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeedCard } from '@/components/feed/FeedCard';
import { TraderMiniCard } from '@/components/feed/TraderMiniCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { usePosts } from '@/hooks/usePosts';
import { useTraders } from '@/hooks/useTraders';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFollowedTraders } from '@/hooks/useFollowedTraders';
import { isValidPostContent } from '@/components/feed/MarkdownContent';
import type { FeedItem, Post as FeedPost, Trader as FeedTrader } from '@/types';

type FilterType = 'all' | 'following' | 'assets' | 'traders' | 'saved';

export default function FeedPage() {
  const [filter, setFilter] = useState<FilterType>('all');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  const { data: posts, isLoading: postsLoading } = usePosts();
  const { data: traders, isLoading: tradersLoading } = useTraders();
  const { followedTraderIds, isLoading: followsLoading, toggleFollow, isFollowing } = useFollowedTraders();

  // Transform database posts to FeedItem format, filtering out garbage content
  const feedItems: FeedItem[] = (posts || [])
    .filter(post => isValidPostContent(post.content)) // Filter out garbage posts
    .map((post) => {
      // Map database trader to FeedPost trader format
      const mappedTrader: FeedTrader | undefined = post.traders ? {
        id: post.traders.id,
        etoro_trader_id: post.traders.etoro_username,
        display_name: post.traders.display_name,
        avatar_url: post.traders.avatar_url || '',
        bio: post.traders.bio || '',
        risk_score: post.traders.risk_score || 0,
        return_12m: post.traders.gain_12m || 0,
        return_24m: post.traders.gain_24m || 0,
        max_drawdown: post.traders.max_drawdown || 0,
        num_copiers: post.traders.copiers || 0,
        style_tags: post.traders.tags || [],
        created_at: post.traders.created_at || '',
        updated_at: post.traders.updated_at || '',
        profitable_weeks_pct: post.traders.profitable_weeks_pct || 0,
        profitable_months_pct: post.traders.profitable_months_pct || 0,
        aum: post.traders.aum,
        active_since: post.traders.active_since || '',
        country: post.traders.country || '',
        verified: post.traders.verified || false,
        avg_trade_duration_days: post.traders.avg_holding_time_days || 0,
        trades_per_week: post.traders.avg_trades_per_week || 0,
        win_rate: 0,
        long_short_ratio: 0,
        sharpe_ratio: null,
        sortino_ratio: null,
        daily_var: null,
        beta: null,
        monthly_returns: [],
        performance_history: [],
        copier_history: [],
      } : undefined;

      const feedPost: FeedPost = {
        id: post.id,
        source: 'etoro',
        source_post_id: post.etoro_post_id || '',
        trader_id: post.trader_id,
        asset_id: null,
        text: post.content,
        created_at: post.posted_at || post.created_at || '',
        like_count: post.likes || 0,
        comment_count: post.comments || 0,
        raw_json: {},
        trader: mappedTrader,
      };

      return {
        id: post.id,
        type: 'post' as const,
        data: feedPost,
        created_at: post.posted_at || post.created_at || '',
      };
    });

  // Get real followed traders from the database
  const followedTraders = (traders || []).filter(t => followedTraderIds.includes(t.id));

  // Deduplicate feed items by etoro_post_id to prevent duplicates
  const deduplicatedFeedItems = feedItems.reduce((acc, item) => {
    // Only posts have source_post_id - use type guard
    if (item.type === 'post') {
      const postData = item.data as FeedPost;
      const uniqueKey = postData.source_post_id || `${postData.trader_id}-${item.created_at}`;
      if (!acc.some(existing => {
        if (existing.type === 'post') {
          const existingPost = existing.data as FeedPost;
          return (existingPost.source_post_id || `${existingPost.trader_id}-${existing.created_at}`) === uniqueKey;
        }
        return false;
      })) {
        acc.push(item);
      }
    } else {
      acc.push(item);
    }
    return acc;
  }, [] as typeof feedItems);
  
  // Filter feed items based on selected filter
  const filteredFeedItems = (() => {
    switch (filter) {
      case 'following':
        return deduplicatedFeedItems.filter(item => {
          if (item.type === 'post') {
            const postData = item.data as FeedPost;
            return postData.trader_id && followedTraderIds.includes(postData.trader_id);
          }
          return false;
        });
      case 'assets':
        // Show posts that mention specific assets/symbols (check post text for $SYMBOL patterns)
        return deduplicatedFeedItems.filter(item => {
          if (item.type === 'post') {
            const postData = item.data as FeedPost;
            const text = postData.text || '';
            return /\$[A-Z]{1,5}\b/.test(text);
          }
          return false;
        });
      case 'traders':
        // Show posts from verified/top traders (by copiers)
        const topTraderIds = (traders || [])
          .sort((a, b) => (b.copiers || 0) - (a.copiers || 0))
          .slice(0, 20)
          .map(t => t.id);
        return deduplicatedFeedItems.filter(item => {
          if (item.type === 'post') {
            const postData = item.data as FeedPost;
            return postData.trader_id && topTraderIds.includes(postData.trader_id);
          }
          return false;
        });
      case 'saved':
        // TODO: Implement saved posts functionality with a saved_posts table
        return [];
      default:
        return deduplicatedFeedItems;
    }
  })();

  const handleViewTrader = (traderId: string) => {
    navigate(`/traders/${traderId}`);
  };

  const handleAnalyse = (item: FeedItem) => {
    navigate('/analysis');
  };

  const handleStarForIC = (item: FeedItem) => {
    navigate('/ic');
  };

  const isLoading = postsLoading || tradersLoading || followsLoading;

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
                {tradersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {followedTraders.length > 0 ? (
                      followedTraders.map(trader => (
                        <TraderMiniCard
                          key={trader.id}
                          trader={{
                            id: trader.id,
                            display_name: trader.display_name,
                            avatar_url: trader.avatar_url || '',
                            return_12m: trader.gain_12m || 0,
                            risk_score: trader.risk_score || 0,
                          }}
                          isFollowing
                          onClick={() => handleViewTrader(trader.id)}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        You're not following any traders yet.
                      </p>
                    )}
                  </div>
                )}
                <Button variant="ghost" size="sm" className="w-full mt-3" onClick={() => navigate('/traders')}>
                  Discover more traders
                </Button>
              </div>
            </div>
          </aside>
        )}

        {/* Main Feed */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredFeedItems.length > 0 ? (
            <div className="space-y-4">
              {filteredFeedItems.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  onAnalyse={handleAnalyse}
                  onStarForIC={handleStarForIC}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No posts found. Run the scrape-posts edge function to fetch data.</p>
            </div>
          )}
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
                    <span className="text-sm text-muted-foreground">Total traders</span>
                    <span className="font-medium text-primary">{traders?.length || 0}</span>
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
