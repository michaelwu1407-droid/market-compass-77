import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Report } from '@/types';
import { cn } from '@/lib/utils';

interface ReportTableProps {
  reports: Report[];
  onSelect?: (report: Report) => void;
}

export function ReportTable({ reports, onSelect }: ReportTableProps) {
  const statusColors = {
    to_review: 'bg-warning/10 text-warning',
    in_progress: 'bg-primary/10 text-primary',
    approved: 'bg-gain/10 text-gain',
    rejected: 'bg-loss/10 text-loss',
  };

  const ratingColors = {
    buy: 'text-gain',
    hold: 'text-warning',
    avoid: 'text-loss',
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Ticker(s)</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Horizon</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead className="text-right">Upside</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => (
            <TableRow 
              key={report.id} 
              className="cursor-pointer hover:bg-secondary/50"
              onClick={() => onSelect?.(report)}
            >
              <TableCell className="font-medium max-w-[200px] truncate">
                {report.title}
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {report.input_assets.slice(0, 3).map(ticker => (
                    <Badge key={ticker} variant="secondary" className="text-xs">
                      {ticker}
                    </Badge>
                  ))}
                  {report.input_assets.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{report.input_assets.length - 3}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="capitalize text-sm">
                {report.report_type.replace('_', ' ')}
              </TableCell>
              <TableCell>{report.horizon}</TableCell>
              <TableCell>
                {report.rating ? (
                  <span className={cn("font-medium uppercase text-sm", ratingColors[report.rating])}>
                    {report.rating}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {report.upside_pct_estimate !== null ? (
                  <span className={cn("font-medium", report.upside_pct_estimate >= 0 ? "text-gain" : "text-loss")}>
                    {report.upside_pct_estimate >= 0 ? '+' : ''}{report.upside_pct_estimate}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge className={cn("text-xs capitalize", statusColors[report.status])}>
                  {report.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDistanceToNow(new Date(report.updated_at), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
