import { Sparkles, Star, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { DailyMover } from '@/types';
import { cn } from '@/lib/utils';

interface DailyMoverRowProps {
  mover: DailyMover;
  onAnalyse?: () => void;
  onStarForIC?: () => void;
}

export function DailyMoverRow({ mover, onAnalyse, onStarForIC }: DailyMoverRowProps) {
  const isPositive = mover.pct_change >= 0;

  const handleViewAsset = () => {
    toast({
      title: 'Coming Soon',
      description: 'Asset detail page is coming soon.',
    });
  };

  return (
    <div className="p-4 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span 
              className="font-semibold cursor-pointer hover:text-primary transition-colors"
              onClick={handleViewAsset}
            >
              {mover.asset?.name}
            </span>
            <span 
              className="chip-ticker cursor-pointer"
              onClick={handleViewAsset}
            >
              ${mover.asset?.ticker}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{mover.reason_summary}</p>
        </div>
        
        <div className="text-right flex-shrink-0">
          <div className={cn("text-lg font-bold", isPositive ? "text-gain" : "text-loss")}>
            {isPositive ? '+' : ''}{mover.pct_change.toFixed(1)}%
          </div>
          {mover.volume && (
            <div className="text-xs text-muted-foreground">
              Vol: {(mover.volume / 1000000).toFixed(1)}M
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleViewAsset}>
          <Eye className="h-3.5 w-3.5 mr-1" />
          View
        </Button>
        <Button variant="ghost" size="sm" onClick={onAnalyse}>
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          Analyse
        </Button>
        <Button variant="ghost" size="sm" onClick={onStarForIC}>
          <Star className="h-3.5 w-3.5 mr-1" />
          Star
        </Button>
      </div>
    </div>
  );
}