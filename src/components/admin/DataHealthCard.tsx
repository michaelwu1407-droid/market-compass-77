import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { CheckCircle, AlertCircle, XCircle, AlertTriangle } from 'lucide-react';

interface FieldHealth {
  label: string;
  current: number;
  total: number;
  hint?: string;
}

interface DataHealthCardProps {
  title: string;
  icon: React.ReactNode;
  fields: FieldHealth[];
}

function getStatusInfo(percentage: number) {
  if (percentage >= 90) return { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500' };
  if (percentage >= 50) return { icon: AlertTriangle, color: 'text-yellow-500', bgColor: 'bg-yellow-500' };
  if (percentage > 0) return { icon: AlertCircle, color: 'text-orange-500', bgColor: 'bg-orange-500' };
  return { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500' };
}

export default function DataHealthCard({ title, icon, fields }: DataHealthCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map((field) => {
          const percentage = field.total > 0 ? (field.current / field.total) * 100 : 0;
          const status = getStatusInfo(percentage);
          const StatusIcon = status.icon;
          
          return (
            <div key={field.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <StatusIcon className={cn('h-3.5 w-3.5', status.color)} />
                  <span className="text-muted-foreground">{field.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">
                    {field.current}/{field.total}
                  </span>
                  <span className={cn('font-medium text-xs w-10 text-right', status.color)}>
                    {percentage.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="relative">
                <Progress value={percentage} className="h-1.5" />
              </div>
              {field.hint && (
                <p className="text-xs text-muted-foreground pl-5">{field.hint}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
