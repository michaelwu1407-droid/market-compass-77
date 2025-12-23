import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Users, BarChart3, TrendingUp, Package } from 'lucide-react';

interface PipelineStage {
  id: string;
  label: string;
  current: number;
  total: number;
  status: 'idle' | 'paginating' | 'complete';
  icon: React.ReactNode;
}

interface PipelineStatusProps {
  stages: PipelineStage[];
}

function getStatusBadge(status: string, progress: number) {
  if (status === 'paginating') {
    return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">In Progress</Badge>;
  }
  if (progress >= 100) {
    return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Complete</Badge>;
  }
  if (progress > 0) {
    return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">Partial</Badge>;
  }
  return <Badge variant="secondary">Pending</Badge>;
}

export default function PipelineStatus({ stages }: PipelineStatusProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Sync Pipeline</CardTitle>
        <CardDescription>Data flows from Discovery → Details → Metrics → Assets</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stages.map((stage, index) => {
            const progress = stage.total > 0 ? (stage.current / stage.total) * 100 : 0;
            
            return (
              <div key={stage.id} className="relative">
                <div className="p-4 rounded-lg border bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-muted">
                      {stage.icon}
                    </div>
                    {getStatusBadge(stage.status, progress)}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{stage.label}</h4>
                    <p className="text-2xl font-bold">
                      {stage.current}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{stage.total > 0 ? stage.total : '?'}
                      </span>
                    </p>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
                {index < stages.length - 1 && (
                  <div className="hidden lg:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export { Users, BarChart3, TrendingUp, Package };
