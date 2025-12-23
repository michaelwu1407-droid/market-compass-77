import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import type { TraderEquityPoint } from '@/hooks/useTraderEquityHistory';

interface PerformanceVsBenchmarkChartProps {
  data: TraderEquityPoint[];
  height?: number;
}

type TimeRange = '6M' | '1Y' | '2Y' | 'MAX';

export function PerformanceVsBenchmarkChart({ data, height = 300 }: PerformanceVsBenchmarkChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const now = new Date();
    let cutoffDate: Date;
    
    switch (timeRange) {
      case '6M':
        cutoffDate = new Date(now.setMonth(now.getMonth() - 6));
        break;
      case '1Y':
        cutoffDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      case '2Y':
        cutoffDate = new Date(now.setFullYear(now.getFullYear() - 2));
        break;
      case 'MAX':
      default:
        cutoffDate = new Date(0);
    }

    return data
      .filter(point => new Date(point.date) >= cutoffDate)
      .map(point => ({
        date: point.date,
        trader: point.equity_value,
        benchmark: point.benchmark_value,
      }));
  }, [data, timeRange]);

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
        No performance history available
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-md p-3 shadow-lg">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
              {entry.name}: {entry.value?.toFixed(2)}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const timeRanges: TimeRange[] = ['6M', '1Y', '2Y', 'MAX'];

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {timeRanges.map((range) => (
          <Button
            key={range}
            variant={timeRange === range ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange(range)}
            className="text-xs px-3"
          >
            {range}
          </Button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={filteredData}>
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }}
          />
          <YAxis 
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="trader" 
            stroke="hsl(var(--primary))" 
            name="Trader"
            strokeWidth={2}
            dot={false}
          />
          <Line 
            type="monotone" 
            dataKey="benchmark" 
            stroke="hsl(var(--muted-foreground))" 
            name="S&P 500"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
