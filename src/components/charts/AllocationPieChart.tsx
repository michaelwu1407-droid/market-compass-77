import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface HoldingData {
  asset: {
    id: string;
    name: string;
    ticker: string;
    sector: string;
  };
  weight_pct: number;
  pnl_pct: number;
}

interface AllocationPieChartProps {
  holdings: HoldingData[];
  height?: number;
  showLegend?: boolean;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--gain))',
  'hsl(210 70% 50%)',
  'hsl(280 70% 50%)',
  'hsl(45 90% 50%)',
  'hsl(var(--loss))',
  'hsl(170 70% 45%)',
  'hsl(320 70% 50%)',
];

export function AllocationPieChart({ holdings, height = 250, showLegend = true }: AllocationPieChartProps) {
  const data = holdings.map((h, i) => ({
    name: h.asset.ticker,
    value: h.weight_pct,
    fullName: h.asset.name,
    color: COLORS[i % COLORS.length],
  }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullName: string; value: number } }> }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
          <p className="text-sm font-medium">{item.fullName}</p>
          <p className="text-xs text-muted-foreground">{item.value.toFixed(1)}% of portfolio</p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: { payload?: Array<{ value: string; color: string }> }) => {
    if (!payload) return null;
    return (
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div 
              className="w-2.5 h-2.5 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs text-muted-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        {showLegend && <Legend content={<CustomLegend />} />}
      </PieChart>
    </ResponsiveContainer>
  );
}
