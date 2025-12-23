import { AlertTriangle, XCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KnownIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

interface KnownIssuesAlertProps {
  issues: KnownIssue[];
}

function getSeverityStyles(severity: 'critical' | 'warning' | 'info') {
  switch (severity) {
    case 'critical':
      return {
        icon: XCircle,
        bg: 'bg-red-500/10 border-red-500/20',
        text: 'text-red-600',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        bg: 'bg-yellow-500/10 border-yellow-500/20',
        text: 'text-yellow-600',
      };
    case 'info':
      return {
        icon: Info,
        bg: 'bg-blue-500/10 border-blue-500/20',
        text: 'text-blue-600',
      };
  }
}

export default function KnownIssuesAlert({ issues }: KnownIssuesAlertProps) {
  if (issues.length === 0) return null;
  
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 font-medium">
        <AlertCircle className="h-4 w-4 text-yellow-500" />
        Known Issues
      </div>
      <div className="space-y-2">
        {issues.map((issue) => {
          const styles = getSeverityStyles(issue.severity);
          const Icon = styles.icon;
          
          return (
            <div
              key={issue.id}
              className={cn(
                'flex items-start gap-2 p-2 rounded-md border text-sm',
                styles.bg
              )}
            >
              <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', styles.text)} />
              <span className={styles.text}>{issue.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
