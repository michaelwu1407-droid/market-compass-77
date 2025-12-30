import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

interface TraderMiniCardProps {
  trader: {
    id: string;
    display_name: string;
    avatar_url: string;
    return_12m: number;
    risk_score: number;
  };
  onClick?: () => void;
  isFollowing?: boolean;
}

export function TraderMiniCard({ trader, onClick, isFollowing }: TraderMiniCardProps) {
  const displayName = String((trader as any)?.display_name || 'Trader');
  const fallbackInitial = (displayName.trim()[0] || 'T').toUpperCase();

  return (
    <Link
      to={`/traders/${trader.id}`}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <Avatar className="h-9 w-9">
        <AvatarImage src={trader.avatar_url} />
        <AvatarFallback>{fallbackInitial}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{trader.display_name}</span>
          {isFollowing && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Following</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-gain">+{trader.return_12m}%</span>
          <span>·</span>
          <span>Risk {trader.risk_score}</span>
        </div>
      </div>
    </Link>
  );
}
