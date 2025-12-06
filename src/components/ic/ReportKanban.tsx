import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Report, ReportStatus } from '@/types';
import { cn } from '@/lib/utils';

interface ReportKanbanProps {
  reports: Report[];
  onSelect?: (report: Report) => void;
  onStatusChange?: (reportId: string, newStatus: ReportStatus) => void;
}

const columns: { status: ReportStatus; label: string; color: string }[] = [
  { status: 'to_review', label: 'To Review', color: 'border-t-warning' },
  { status: 'in_progress', label: 'In Progress', color: 'border-t-primary' },
  { status: 'approved', label: 'Approved', color: 'border-t-gain' },
  { status: 'rejected', label: 'Rejected', color: 'border-t-loss' },
];

export function ReportKanban({ reports, onSelect, onStatusChange }: ReportKanbanProps) {
  const ratingColors = {
    buy: 'text-gain',
    hold: 'text-warning',
    avoid: 'text-loss',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((column) => {
        const columnReports = reports.filter(r => r.status === column.status);
        
        return (
          <div key={column.status} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{column.label}</h3>
              <Badge variant="secondary" className="text-xs">
                {columnReports.length}
              </Badge>
            </div>
            
            <div className={cn("min-h-[200px] p-2 bg-secondary/30 rounded-lg space-y-2", column.color, "border-t-4")}>
              {columnReports.map((report) => (
                <Card 
                  key={report.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onSelect?.(report)}
                >
                  <CardContent className="p-3">
                    <h4 className="font-medium text-sm mb-2 line-clamp-2">{report.title}</h4>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {report.input_assets.slice(0, 2).map(ticker => (
                        <Badge key={ticker} variant="secondary" className="text-[10px]">
                          {ticker}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      {report.upside_pct_estimate !== null && (
                        <span className={cn("font-medium", report.upside_pct_estimate >= 0 ? "text-gain" : "text-loss")}>
                          {report.upside_pct_estimate >= 0 ? '+' : ''}{report.upside_pct_estimate}%
                        </span>
                      )}
                      {report.rating && (
                        <span className={cn("font-medium uppercase", ratingColors[report.rating])}>
                          {report.rating}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {columnReports.length === 0 && (
                <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                  No reports
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
