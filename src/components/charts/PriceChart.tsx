import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PriceChartProps {
  data: { date: string; price?: number; value?: number }[];
  height?: number;
  showRangeSelector?: boolean;
  color?: 'gain' | 'loss' | 'primary';
  type?: 'line' | 'area';
}

const timeRanges = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 9999 },
];

export function PriceChart({ 
  data, 
  height = 300, 
  showRangeSelector = true,
  color = 'primary',
  type = 'area'
}: PriceChartProps) {
  const [selectedRange, setSelectedRange] = useState('1Y');

  const selectedDays = timeRanges.find(r => r.label === selectedRange)?.days || 365;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - selectedDays);

  const filteredData = data.filter(d => new Date(d.date) >= cutoffDate);
  const valueKey = 'price' in (data[0] || {}) ? 'price' : 'value';

  const values = filteredData.map(d => d.price ?? d.value ?? 0);
  const minValue = Math.min(...values) * 0.95;
  const maxValue = Math.max(...values) * 1.05;
  const isPositive = values.length >= 2 && values[values.length - 1] >= values[0];

  const strokeColor = color === 'gain' ? 'hsl(var(--gain))' : 
                      color === 'loss' ? 'hsl(var(--loss))' : 
                      isPositive ? 'hsl(var(--gain))' : 'hsl(var(--loss))';

  const formatDate = (date: string) => {
    const d = new Date(date);
    if (selectedDays <= 30) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const formatValue = (value: number) => {
    if (valueKey === 'price') {
      return `$${value.toFixed(2)}`;
    }
    return value.toFixed(1);
  };

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold">{formatValue(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      {showRangeSelector && (
        <div className="flex items-center gap-1 mb-4">
          {timeRanges.map((range) => (
            <Button
              key={range.label}
              variant={selectedRange === range.label ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setSelectedRange(range.label)}
            >
              {range.label}
            </Button>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        {type === 'area' ? (
          <AreaChart data={filteredData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis 
              domain={[minValue, maxValue]}
              tickFormatter={(v) => valueKey === 'price' ? `$${v}` : v}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke={strokeColor}
              strokeWidth={2}
              fill={`url(#gradient-${color})`}
            />
          </AreaChart>
        ) : (
          <LineChart data={filteredData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              domain={[minValue, maxValue]}
              tickFormatter={(v) => valueKey === 'price' ? `$${v}` : v}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey={valueKey}
              stroke={strokeColor}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
