import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, TrendingUp, Eye, Sparkles, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FeedItem, Post, Trade, DailyMover } from '@/types';
import { cn } from '@/lib/utils';

interface FeedCardProps {
  item: FeedItem;
  onViewTrader?: (traderId: string) => void;
  onViewAsset?: (assetId: string) => void;
  onAnalyse?: (item: FeedItem) => void;
  onStarForIC?: (item: FeedItem) => void;
}

export function FeedCard({ item, onViewTrader, onViewAsset, onAnalyse, onStarForIC }: FeedCardProps) {
  const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true });

  if (item.type === 'post') {
    const post = item.data as Post;
    return (
      <div className="feed-card animate-fade-in">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <Avatar className="h-10 w-10 cursor-pointer" onClick={() => post.trader && onViewTrader?.(post.trader.id)}>
            <AvatarImage src={post.trader?.avatar_url} />
            <AvatarFallback>{post.trader?.display_name?.[0] ?? 'T'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{post.trader?.display_name}</span>
              {post.trader && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-gain">+{post.trader.return_12m}% 12m</span>
                  <span>·</span>
                  <span>Risk {post.trader.risk_score}</span>
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
        </div>

        {/* Content */}
        <p className="text-sm leading-relaxed mb-3">
          {post.text.split(/(\$[A-Z]+)/g).map((part, i) => 
            part.startsWith('$') ? (
              <span 
                key={i} 
                className="chip-ticker"
                onClick={() => post.asset && onViewAsset?.(post.asset.id)}
              >
                {part}
              </span>
            ) : part
          )}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {post.like_count}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {post.comment_count}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {post.trader && (
            <Button variant="secondary" size="sm" onClick={() => onViewTrader?.(post.trader!.id)}>
              <Eye className="h-3.5 w-3.5 mr-1" />
              View trader
            </Button>
          )}
          {post.asset && (
            <Button variant="secondary" size="sm" onClick={() => onViewAsset?.(post.asset!.id)}>
              View {post.asset.ticker}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onAnalyse?.(item)}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Analyse
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onStarForIC?.(item)}>
            <Star className="h-3.5 w-3.5 mr-1" />
            Star for IC
          </Button>
        </div>
      </div>
    );
  }

  if (item.type === 'trade') {
    const trade = item.data as Trade;
    const isPositive = trade.trade_type === 'buy';
    
    return (
      <div className="feed-card animate-fade-in border-l-4 border-l-primary">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className={cn(
            "text-xs",
            isPositive ? "text-gain border-gain" : "text-loss border-loss"
          )}>
            {trade.trade_type.toUpperCase()}
          </Badge>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>

        <p className="text-sm font-medium mb-1">
          {trade.trader?.display_name} just {trade.trade_type === 'buy' ? 'bought' : 'sold'}{' '}
          <span className="chip-ticker" onClick={() => trade.asset && onViewAsset?.(trade.asset.id)}>
            ${trade.asset?.ticker}
          </span>
        </p>

        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <span>${trade.price.toFixed(2)} × {trade.quantity}</span>
          <span>Value: ${trade.trade_value.toLocaleString()}</span>
          {trade.portfolio_weight_after && (
            <span>Weight after: {trade.portfolio_weight_after}%</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {trade.trader && (
            <Button variant="secondary" size="sm" onClick={() => onViewTrader?.(trade.trader!.id)}>
              View trader
            </Button>
          )}
          {trade.asset && (
            <Button variant="secondary" size="sm" onClick={() => onViewAsset?.(trade.asset!.id)}>
              View asset
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onAnalyse?.(item)}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Analyse
          </Button>
        </div>
      </div>
    );
  }

  if (item.type === 'trending') {
    const mover = item.data as DailyMover & { mentions_change: number };
    const isPositive = mover.pct_change >= 0;

    return (
      <div className="feed-card animate-fade-in bg-gradient-to-r from-accent/50 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-primary">Trending</span>
        </div>

        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="font-semibold">{mover.asset?.name}</span>
            <span className="chip-ticker ml-2" onClick={() => mover.asset && onViewAsset?.(mover.asset.id)}>
              ${mover.asset?.ticker}
            </span>
          </div>
          <span className={cn("font-bold text-lg", isPositive ? "text-gain" : "text-loss")}>
            {isPositive ? '+' : ''}{mover.pct_change.toFixed(1)}%
          </span>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Mentions +{mover.mentions_change}% vs 7-day avg
        </p>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onAnalyse?.(item)}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Open in Analysis
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onStarForIC?.(item)}>
            <Star className="h-3.5 w-3.5 mr-1" />
            Star for IC
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
