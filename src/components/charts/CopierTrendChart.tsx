import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

interface CopierTrendChartProps {
  data: { date: string; count: number }[];
  height?: number;
}

export function CopierTrendChart({ data, height = 60 }: CopierTrendChartProps) {
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded px-2 py-1 shadow-lg">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className="text-xs font-semibold">{payload[0].value.toLocaleString()} copiers</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="copierGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          fill="url(#copierGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
