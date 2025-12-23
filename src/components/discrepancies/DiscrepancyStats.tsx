import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useDiscrepancyStats } from '@/hooks/useDiscrepancies';

export function DiscrepancyStats() {
  const { data: stats, isLoading } = useDiscrepancyStats();

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-20" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total',
      value: stats.total,
      icon: AlertTriangle,
      color: 'text-foreground',
    },
    {
      title: 'Pending Review',
      value: stats.pending,
      icon: Clock,
      color: 'text-yellow-500',
    },
    {
      title: 'Reviewed',
      value: stats.reviewed,
      icon: CheckCircle,
      color: 'text-green-500',
    },
    {
      title: 'Dismissed',
      value: stats.dismissed,
      icon: XCircle,
      color: 'text-muted-foreground',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By Entity Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.byEntityType).map(([type, count]) => (
                <div key={type} className="flex justify-between items-center">
                  <span className="text-sm capitalize">{type}</span>
                  <span className="font-mono text-sm">{count}</span>
                </div>
              ))}
              {Object.keys(stats.byEntityType).length === 0 && (
                <div className="text-sm text-muted-foreground">No data yet</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By Field</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.byField)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([field, count]) => (
                  <div key={field} className="flex justify-between items-center">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{field}</code>
                    <span className="font-mono text-sm">{count}</span>
                  </div>
                ))}
              {Object.keys(stats.byField).length === 0 && (
                <div className="text-sm text-muted-foreground">No data yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
