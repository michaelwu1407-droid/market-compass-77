import { cn } from '@/lib/utils';

interface MonthlyReturnsGridProps {
  returns: { month: string; return_pct: number }[];
  year?: number;
}

export function MonthlyReturnsGrid({ returns, year = new Date().getFullYear() }: MonthlyReturnsGridProps) {
  const getColorClass = (value: number) => {
    if (value >= 5) return 'bg-gain/80 text-white';
    if (value >= 2) return 'bg-gain/50 text-foreground';
    if (value >= 0) return 'bg-gain/20 text-foreground';
    if (value >= -2) return 'bg-loss/20 text-foreground';
    if (value >= -5) return 'bg-loss/50 text-foreground';
    return 'bg-loss/80 text-white';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{year} Monthly Returns</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-gain/50" />
            Gain
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-loss/50" />
            Loss
          </span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {returns.map((item) => (
          <div
            key={item.month}
            className={cn(
              "flex flex-col items-center justify-center py-2 rounded-md transition-all hover:scale-105",
              getColorClass(item.return_pct)
            )}
          >
            <span className="text-[10px] opacity-80">{item.month}</span>
            <span className="text-xs font-semibold">
              {item.return_pct >= 0 ? '+' : ''}{item.return_pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
