import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { TraderPortfolioSnapshot } from '@/hooks/useTraderPortfolioHistory';

interface PortfolioHistoryChartProps {
  data: TraderPortfolioSnapshot[];
  height?: number;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210, 80%, 60%)',
  'hsl(280, 60%, 55%)',
  'hsl(40, 90%, 55%)',
  'hsl(160, 70%, 45%)',
  'hsl(0, 70%, 55%)',
];

export function PortfolioHistoryChart({ data, height = 300 }: PortfolioHistoryChartProps) {
  const { chartData, topSymbols } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], topSymbols: [] };
    
    // Collect all symbols across all snapshots
    const symbolTotals = new Map<string, number>();
    data.forEach(snapshot => {
      snapshot.holdings.forEach(holding => {
        const current = symbolTotals.get(holding.symbol) || 0;
        symbolTotals.set(holding.symbol, current + (holding.value || 0));
      });
    });
    
    // Get top 8 symbols by total value, rest goes to "Other"
    const sortedSymbols = Array.from(symbolTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([symbol]) => symbol);
    
    // Transform data for stacked area chart
    const transformed = data.map(snapshot => {
      const point: Record<string, any> = { date: snapshot.date };
      let otherValue = 0;
      
      snapshot.holdings.forEach(holding => {
        if (sortedSymbols.includes(holding.symbol)) {
          point[holding.symbol] = holding.value || 0;
        } else {
          otherValue += holding.value || 0;
        }
      });
      
      // Fill missing symbols with 0
      sortedSymbols.forEach(symbol => {
        if (point[symbol] === undefined) point[symbol] = 0;
      });
      
      if (otherValue > 0) {
        point['Other'] = otherValue;
      }
      
      return point;
    });
    
    // Check if any snapshot has "Other" value
    let hasOther = false;
    data.forEach(snapshot => {
      const nonTopHoldings = snapshot.holdings.filter(h => !sortedSymbols.includes(h.symbol));
      if (nonTopHoldings.length > 0) hasOther = true;
    });
    
    return { 
      chartData: transformed, 
      topSymbols: hasOther ? [...sortedSymbols, 'Other'] : sortedSymbols 
    };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
        No portfolio history available
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);
      return (
        <div className="bg-popover border border-border rounded-md p-3 shadow-lg max-h-[200px] overflow-y-auto">
          <p className="text-xs text-muted-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs flex justify-between gap-4" style={{ color: entry.color }}>
              <span>{entry.name}</span>
              <span className="font-medium">{((entry.value || 0) * 100).toFixed(1)}%</span>
            </p>
          ))}
          <p className="text-xs font-medium mt-2 pt-2 border-t border-border">
            Total: {(total * 100).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const WrappedLegend = ({ payload }: any) => {
    if (!payload) return null;
    return (
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
        {payload.map((entry: any, index: number) => (
          <div key={`legend-${index}`} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-muted-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full overflow-hidden">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} stackOffset="expand" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          }}
        />
        <YAxis 
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<WrappedLegend />} />
        {topSymbols.map((symbol, index) => (
          <Area
            key={symbol}
            type="monotone"
            dataKey={symbol}
            stackId="1"
            stroke={COLORS[index % COLORS.length]}
            fill={COLORS[index % COLORS.length]}
            fillOpacity={0.8}
          />
        ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
