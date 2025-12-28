import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, TrendingUp, Eye, Sparkles, Star, Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarkdownContent } from './MarkdownContent';
import type { FeedItem, Post, Trade, DailyMover } from '@/types';
import { cn } from '@/lib/utils';

interface FeedCardProps {
  item: FeedItem;
  onAnalyse?: (item: FeedItem) => void;
  onStarForIC?: (item: FeedItem) => void;
  onSave?: (postId: string) => void;
  onUnsave?: (postId: string) => void;
  isSaved?: boolean;
}

export function FeedCard({ item, onAnalyse, onStarForIC, onSave, onUnsave, isSaved }: FeedCardProps) {
  const navigate = useNavigate();
  const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true });

  const handleSaveToggle = (postId: string) => {
    if (isSaved) {
      onUnsave?.(postId);
    } else {
      onSave?.(postId);
    }
  };

  const handleViewTrader = (traderId: string) => {
    navigate(`/traders/${traderId}`);
  };

  const handleViewAsset = (assetId: string) => {
    navigate(`/assets/${assetId}`);
  };

  if (item.type === 'post') {
    const post = item.data as Post;
    return (
      <div className="feed-card animate-fade-in">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
            <Avatar 
            className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary transition-all" 
            onClick={() => post.trader && handleViewTrader(post.trader.id)}
          >
            <AvatarImage src={post.poster_avatar || post.trader?.avatar_url} />
            <AvatarFallback>{(post.poster_first?.[0] || post.poster_last?.[0] || post.trader?.display_name?.[0] || 'T')}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span 
                className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors"
                onClick={() => post.trader && handleViewTrader(post.trader.id)}
              >
                {post.poster_first || post.poster_last
                  ? `${post.poster_first || ''} ${post.poster_last || ''}`.trim()
                  : post.trader?.display_name}
              </span>
              {post.trader && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-gain">+{post.trader.return_12m}% 12m</span>
                  <span>·</span>
                  <span>Risk {post.trader.risk_score}</span>
                </div>
              )}
              {/* Show classification if present */}
              {post._classif && (
                <Badge variant="outline" className="ml-2 text-xs">{post._classif}</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
        </div>

        {/* Content - render markdown with images */}
        <MarkdownContent content={post.text} className="mb-3" />
        
        {/* Show link to full post if content is truncated */}
        {post.text?.includes('[...]') && post.trader?.etoro_trader_id && (
          <a 
            href={`https://www.etoro.com/people/${post.trader.etoro_trader_id}/feed`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mb-3"
          >
            <ExternalLink className="h-3 w-3" />
            Read full post on eToro
          </a>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {post.likes ?? post.like_count ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {post.comments ?? post.comment_count ?? 0}
          </span>
          {/* Show content source/length if present */}
          {post._content_source && (
            <span className="ml-2 text-xs">src: {post._content_source}</span>
          )}
          {typeof post._content_len === 'number' && (
            <span className="ml-2 text-xs">len: {post._content_len}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {post.trader && (
            <Button variant="secondary" size="sm" onClick={() => handleViewTrader(post.trader!.id)}>
              <Eye className="h-3.5 w-3.5 mr-1" />
              View trader
            </Button>
          )}
          {post.asset && (
            <Button variant="secondary" size="sm" onClick={() => handleViewAsset(post.asset!.id)}>
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
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleSaveToggle(post.id)}
            className={isSaved ? "text-primary" : ""}
          >
            {isSaved ? (
              <BookmarkCheck className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Bookmark className="h-3.5 w-3.5 mr-1" />
            )}
            {isSaved ? 'Saved' : 'Save'}
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
          <span 
            className="cursor-pointer hover:text-primary transition-colors"
            onClick={() => trade.trader && handleViewTrader(trade.trader.id)}
          >
            {trade.trader?.display_name}
          </span>
          {' '}just {trade.trade_type === 'buy' ? 'bought' : 'sold'}{' '}
          <span 
            className="chip-ticker" 
            onClick={() => trade.asset && handleViewAsset(trade.asset.id)}
          >
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
            <Button variant="secondary" size="sm" onClick={() => handleViewTrader(trade.trader!.id)}>
              View trader
            </Button>
          )}
          {trade.asset && (
            <Button variant="secondary" size="sm" onClick={() => handleViewAsset(trade.asset!.id)}>
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
            <span 
              className="chip-ticker ml-2 cursor-pointer" 
              onClick={() => mover.asset && handleViewAsset(mover.asset.id)}
            >
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
          {mover.asset && (
            <Button variant="secondary" size="sm" onClick={() => handleViewAsset(mover.asset!.id)}>
              View asset
            </Button>
          )}
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
