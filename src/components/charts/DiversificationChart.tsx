import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DiversificationData {
  name: string;
  value: number;
  color?: string;
}

interface DiversificationChartProps {
  data: DiversificationData[];
  height?: number;
  title?: string;
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
];

export function DiversificationChart({ data, height = 180, title }: DiversificationChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-md p-2 shadow-lg">
          <p className="text-xs font-medium">{payload[0].name}</p>
          <p className="text-sm font-semibold text-primary">
            {payload[0].value.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => (
    <div className="flex flex-wrap gap-2 justify-center mt-2">
      {payload?.slice(0, 5).map((entry: any, index: number) => (
        <div key={`legend-${index}`} className="flex items-center gap-1">
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-xs text-muted-foreground truncate max-w-[60px]">
            {entry.value}
          </span>
        </div>
      ))}
      {payload?.length > 5 && (
        <span className="text-xs text-muted-foreground">
          +{payload.length - 5} more
        </span>
      )}
    </div>
  );

  return (
    <div>
      {title && <h4 className="text-sm font-medium mb-2">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={60}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color || COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
