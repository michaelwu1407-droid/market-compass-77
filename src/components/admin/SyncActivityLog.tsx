import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SyncActivity {
  timestamp: Date;
  message: string;
  success: boolean;
}

interface SyncActivityLogProps {
  activities: SyncActivity[];
}

export default function SyncActivityLog({ activities }: SyncActivityLogProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent sync activity. Trigger a sync to see updates here.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {activities.map((activity, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-start gap-2 p-2 rounded-md text-sm',
                  activity.success 
                    ? 'bg-green-500/5 border border-green-500/10' 
                    : 'bg-red-500/5 border border-red-500/10'
                )}
              >
                {activity.success ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-muted-foreground font-mono text-xs mr-2">
                    {formatTime(activity.timestamp)}
                  </span>
                  <span className={activity.success ? 'text-green-600' : 'text-red-600'}>
                    {activity.message}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
