import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';

interface MonthlyReturn {
  year: number;
  month: number;
  return_pct: number | null;
}

interface PerformanceBarChartProps {
  data: MonthlyReturn[];
  height?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function PerformanceBarChart({ data, height = 200 }: PerformanceBarChartProps) {
  // Get the last 12 months of data
  const chartData = data.slice(-12).map(d => ({
    name: `${MONTHS[d.month - 1]} ${d.year.toString().slice(-2)}`,
    value: d.return_pct || 0,
  }));

  if (chartData.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
        No performance data available
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      return (
        <div className="bg-popover border border-border rounded-md p-2 shadow-lg">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn("text-sm font-semibold", value >= 0 ? "text-gain" : "text-loss")}>
            {value >= 0 ? '+' : ''}{value.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis 
          dataKey="name" 
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
        />
        <YAxis 
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.value >= 0 ? 'hsl(var(--gain))' : 'hsl(var(--loss))'}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
