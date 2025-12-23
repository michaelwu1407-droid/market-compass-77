import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Drawdown {
  start_date: string;
  end_date?: string | null;
  depth_pct: number;
  recovery_days?: number | null;
}

interface DrawdownsTableProps {
  drawdowns: Drawdown[];
  maxDrawdown?: number | null;
}

export function DrawdownsTable({ drawdowns, maxDrawdown }: DrawdownsTableProps) {
  if (!drawdowns || drawdowns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Historical Drawdowns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 mb-4">
            <span className="text-sm text-muted-foreground">Maximum Drawdown</span>
            <span className="text-xl font-bold text-loss">
              {maxDrawdown ? `${maxDrawdown.toFixed(1)}%` : '-'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Detailed drawdown history not available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingDown className="h-4 w-4" />
          Historical Drawdowns
        </CardTitle>
      </CardHeader>
      <CardContent>
        {maxDrawdown && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 mb-4">
            <span className="text-sm text-muted-foreground">Maximum Drawdown</span>
            <span className="text-xl font-bold text-loss">{maxDrawdown.toFixed(1)}%</span>
          </div>
        )}
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Depth</TableHead>
              <TableHead className="text-right">Recovery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drawdowns.map((dd, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">
                  {format(new Date(dd.start_date), 'MMM yyyy')}
                  {dd.end_date && ` - ${format(new Date(dd.end_date), 'MMM yyyy')}`}
                </TableCell>
                <TableCell className={cn("text-right font-medium", "text-loss")}>
                  -{Math.abs(dd.depth_pct).toFixed(1)}%
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {dd.recovery_days ? `${dd.recovery_days} days` : 'Ongoing'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
