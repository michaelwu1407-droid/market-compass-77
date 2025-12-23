import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMemo } from 'react';

interface MonthlyReturn {
  year: number;
  month: number;
  return_pct: number | null;
}

interface MonthlyReturnsTableProps {
  performance: MonthlyReturn[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MonthlyReturnsTable({ performance }: MonthlyReturnsTableProps) {
  // Group by year
  const yearlyData = useMemo(() => {
    const grouped: Record<number, Record<number, number | null>> = {};
    
    for (const p of performance) {
      if (!grouped[p.year]) {
        grouped[p.year] = {};
      }
      grouped[p.year][p.month] = p.return_pct;
    }
    
    // Sort years descending
    const years = Object.keys(grouped).map(Number).sort((a, b) => b - a);
    
    return years.map(year => {
      const months = grouped[year];
      const monthlyReturns = MONTHS.map((_, idx) => months[idx + 1] ?? null);
      
      // Calculate annual total (compound returns)
      const validReturns = monthlyReturns.filter(r => r !== null) as number[];
      const annualReturn = validReturns.length > 0
        ? validReturns.reduce((acc, r) => acc * (1 + r / 100), 1) * 100 - 100
        : null;
      
      return {
        year,
        months: monthlyReturns,
        annual: annualReturn,
      };
    });
  }, [performance]);

  const getColorClass = (value: number | null) => {
    if (value === null) return 'text-muted-foreground/50';
    if (value >= 5) return 'bg-gain/15 text-gain font-medium';
    if (value >= 2) return 'bg-gain/10 text-gain';
    if (value >= 0) return 'text-gain';
    if (value >= -2) return 'text-loss';
    if (value >= -5) return 'bg-loss/10 text-loss';
    return 'bg-loss/15 text-loss font-medium';
  };

  const formatValue = (value: number | null) => {
    if (value === null) return '–';
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (yearlyData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No monthly returns data available</p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b">
            <TableHead className="w-14 font-semibold text-xs h-8 sticky left-0 bg-background z-10">Year</TableHead>
            {MONTHS.map(month => (
              <TableHead key={month} className="text-center w-12 text-xs h-8 px-1">
                {month}
              </TableHead>
            ))}
            <TableHead className="text-center w-16 font-semibold text-xs h-8 bg-muted/30">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {yearlyData.map(({ year, months, annual }) => (
            <TableRow key={year} className="hover:bg-muted/30">
              <TableCell className="font-semibold text-sm py-1.5 sticky left-0 bg-background z-10">{year}</TableCell>
              {months.map((value, idx) => (
                <TableCell
                  key={idx}
                  className={cn(
                    "text-center text-xs py-1.5 px-1 tabular-nums",
                    getColorClass(value)
                  )}
                >
                  {formatValue(value)}
                </TableCell>
              ))}
              <TableCell
                className={cn(
                  "text-center text-sm py-1.5 font-semibold tabular-nums bg-muted/30",
                  annual !== null ? (annual >= 0 ? 'text-gain' : 'text-loss') : 'text-muted-foreground/50'
                )}
              >
                {formatValue(annual)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
