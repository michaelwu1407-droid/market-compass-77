import { Users, TrendingUp, AlertTriangle, Sparkles, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Trader } from '@/types';
import { cn } from '@/lib/utils';

interface TraderCardProps {
  trader: Trader;
  isFollowing?: boolean;
  onFollow?: () => void;
  onAnalyse?: () => void;
  onStarForIC?: () => void;
  onClick?: () => void;
}

export function TraderCard({ 
  trader, 
  isFollowing, 
  onFollow, 
  onAnalyse, 
  onStarForIC,
  onClick 
}: TraderCardProps) {
  return (
    <Card className="card-hover cursor-pointer" onClick={onClick}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={trader.avatar_url} />
            <AvatarFallback>{trader.display_name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{trader.display_name}</h3>
            <p className="text-xs text-muted-foreground truncate">@{trader.etoro_trader_id}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="stat-card">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              12M Return
            </div>
            <span className={cn("font-bold", trader.return_12m >= 0 ? "text-gain" : "text-loss")}>
              {trader.return_12m >= 0 ? '+' : ''}{trader.return_12m}%
            </span>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3 w-3" />
              Risk Score
            </div>
            <span className="font-bold">{trader.risk_score}/10</span>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Users className="h-3 w-3" />
              Copiers
            </div>
            <span className="font-bold">{(trader.num_copiers / 1000).toFixed(1)}K</span>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              24M Return
            </div>
            <span className={cn("font-bold", trader.return_24m >= 0 ? "text-gain" : "text-loss")}>
              {trader.return_24m >= 0 ? '+' : ''}{trader.return_24m}%
            </span>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {trader.style_tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <Button 
            variant={isFollowing ? "outline" : "default"} 
            size="sm" 
            className="flex-1"
            onClick={onFollow}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onAnalyse}>
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onStarForIC}>
            <Star className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
