import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Trade } from '@/types';
import { cn } from '@/lib/utils';

interface TraderMoveCardProps {
  trade: Trade;
}

export function TraderMoveCard({ trade }: TraderMoveCardProps) {
  const executedAt = trade.executed_at ? new Date(trade.executed_at) : null;
  const hasValidDate = !!executedAt && Number.isFinite(executedAt.getTime());
  const timeAgo = hasValidDate ? formatDistanceToNow(executedAt!, { addSuffix: true }) : 'recently';

  const tradeType = typeof trade.trade_type === 'string' && trade.trade_type.length > 0
    ? trade.trade_type
    : 'trade';
  const isPositive = tradeType === 'buy';
  
  const actionText = tradeType === 'buy' 
    ? 'opened' 
    : tradeType === 'sell' 
      ? 'trimmed' 
      : 'closed';

  return (
    <div className="p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={trade.trader?.avatar_url} />
          <AvatarFallback>{trade.trader?.display_name?.[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <span className="font-medium text-sm">{trade.trader?.display_name}</span>
          <span className="text-muted-foreground text-sm"> {actionText} </span>
          <span className="chip-ticker">${trade.asset?.ticker || '—'}</span>
        </div>
        <Badge variant="outline" className={cn(
          "text-xs",
          isPositive ? "text-gain border-gain" : "text-loss border-loss"
        )}>
          {tradeType.toUpperCase()}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
        <span>${trade.trade_value.toLocaleString()} @ ${trade.price.toFixed(2)}</span>
        <span>{timeAgo}</span>
      </div>

      {/* Placeholder for AI rationale */}
      <div className="p-3 bg-secondary/50 rounded-lg border border-dashed border-border">
        <p className="text-xs text-muted-foreground italic">
          AI-generated rationale will appear here once connected to OpenAI...
        </p>
      </div>
    </div>
  );
}
