import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PerformanceMetricsProps {
  performance: Array<{ year: number; month: number; return_pct: number | null }>;
  gain12m?: number | null;
  gain24m?: number | null;
}

export function PerformanceMetrics({ performance, gain12m, gain24m }: PerformanceMetricsProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Check if we have any monthly performance data
  const hasPerformanceData = performance && performance.length > 0;

  // Calculate YTD return - only if we have data
  const ytdData = performance.filter(p => p.year === currentYear && p.month <= currentMonth);
  const hasYtdData = ytdData.length > 0;
  const ytdReturn = ytdData.reduce((acc, p) => {
    const monthReturn = p.return_pct || 0;
    return acc * (1 + monthReturn / 100);
  }, 1);
  const ytdPct = hasYtdData ? (ytdReturn - 1) * 100 : null;

  // Calculate this month's return - only if we have data for this month
  const thisMonth = performance.find(p => p.year === currentYear && p.month === currentMonth);
  const thisMonthReturn = thisMonth?.return_pct ?? null;

  // Calculate 5Y (if we have enough data)
  const sortedPerf = [...performance].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
  
  const last60Months = sortedPerf.slice(0, 60);
  const calc5YReturn = last60Months.reduce((acc, p) => acc * (1 + (p.return_pct || 0) / 100), 1);
  const fiveYearPct = last60Months.length >= 24 ? (calc5YReturn - 1) * 100 : null;

  // Use gain_12m for annualized return
  const annualizedReturn = gain12m;

  const MetricCard = ({ label, value, suffix = '%' }: { label: string; value: number | null; suffix?: string }) => {
    if (value === null || value === undefined) {
      return (
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">{label}</div>
          <div className="text-lg font-semibold text-muted-foreground">-</div>
        </div>
      );
    }

    const isPositive = value > 0;
    const isNegative = value < 0;

    return (
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className={cn(
          "text-lg font-semibold flex items-center justify-center gap-1",
          isPositive && "text-gain",
          isNegative && "text-loss",
          !isPositive && !isNegative && "text-muted-foreground"
        )}>
          {isPositive && <TrendingUp className="h-3.5 w-3.5" />}
          {isNegative && <TrendingDown className="h-3.5 w-3.5" />}
          {!isPositive && !isNegative && <Minus className="h-3.5 w-3.5" />}
          {value >= 0 ? '+' : ''}{value.toFixed(1)}{suffix}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-4 p-4 bg-secondary/30 rounded-lg">
      <MetricCard label="This Month" value={thisMonthReturn} />
      <MetricCard label="YTD" value={ytdPct} />
      <MetricCard label="1 Year" value={gain12m || null} />
      <MetricCard label="2 Years" value={gain24m ?? null} />
      <MetricCard label="5 Years" value={fiveYearPct} />
      <MetricCard label="Annualized" value={annualizedReturn || null} />
    </div>
  );
}
