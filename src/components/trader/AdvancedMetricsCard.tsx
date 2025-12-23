import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Shield, BarChart3, Target, Activity, Zap, Scale, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdvancedMetricsCardProps {
  sharpeRatio?: number | null;
  sortinoRatio?: number | null;
  beta?: number | null;
  alpha?: number | null;
  volatility?: number | null;
  informationRatio?: number | null;
  omegaRatio?: number | null;
  treynorRatio?: number | null;
  calmarRatio?: number | null;
}

export function AdvancedMetricsCard({
  sharpeRatio,
  sortinoRatio,
  beta,
  alpha,
  volatility,
  informationRatio,
  omegaRatio,
  treynorRatio,
  calmarRatio,
}: AdvancedMetricsCardProps) {
  const primaryMetrics = [
    {
      label: 'Sharpe Ratio',
      value: sharpeRatio,
      format: (v: number) => v.toFixed(2),
      icon: TrendingUp,
      description: 'Risk-adjusted return',
      good: (v: number) => v > 1,
    },
    {
      label: 'Sortino Ratio',
      value: sortinoRatio,
      format: (v: number) => v.toFixed(2),
      icon: Shield,
      description: 'Downside risk-adjusted return',
      good: (v: number) => v > 1.5,
    },
    {
      label: 'Beta',
      value: beta,
      format: (v: number) => v.toFixed(2),
      icon: BarChart3,
      description: 'Market sensitivity',
      good: (v: number) => v >= 0.5 && v <= 1.5,
    },
    {
      label: 'Alpha',
      value: alpha,
      format: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
      icon: Target,
      description: 'Excess return vs benchmark',
      good: (v: number) => v > 0,
    },
  ];

  const secondaryMetrics = [
    {
      label: 'Omega Ratio',
      value: omegaRatio,
      format: (v: number) => v.toFixed(2),
      description: 'Probability-weighted gain/loss',
      good: (v: number) => v > 1,
    },
    {
      label: 'Treynor Ratio',
      value: treynorRatio,
      format: (v: number) => v.toFixed(2),
      description: 'Return per unit of systematic risk',
      good: (v: number) => v > 0,
    },
    {
      label: 'Calmar Ratio',
      value: calmarRatio,
      format: (v: number) => v.toFixed(2),
      description: 'Return vs max drawdown',
      good: (v: number) => v > 1,
    },
    {
      label: 'Information Ratio',
      value: informationRatio,
      format: (v: number) => v.toFixed(2),
      description: 'Active return per tracking error',
      good: (v: number) => v > 0.5,
    },
  ];

  const hasAnyPrimaryData = primaryMetrics.some(m => m.value !== null && m.value !== undefined);
  const hasAnySecondaryData = secondaryMetrics.some(m => m.value !== null && m.value !== undefined);

  if (!hasAnyPrimaryData && !hasAnySecondaryData && volatility === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Advanced Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Advanced metrics not available for this trader yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Advanced Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {primaryMetrics.map((metric) => {
            const Icon = metric.icon;
            const hasValue = metric.value !== null && metric.value !== undefined;
            const isGood = hasValue && metric.good(metric.value!);
            
            return (
              <div key={metric.label} className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{metric.label}</span>
                </div>
                <div className={cn(
                  "text-xl font-bold",
                  hasValue ? (isGood ? "text-gain" : "text-foreground") : "text-muted-foreground"
                )}>
                  {hasValue ? metric.format(metric.value!) : '-'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
              </div>
            );
          })}
        </div>
        
        {/* Secondary Metrics */}
        {hasAnySecondaryData && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {secondaryMetrics.map((metric) => {
                const hasValue = metric.value !== null && metric.value !== undefined;
                const isGood = hasValue && metric.good(metric.value!);
                
                return (
                  <div key={metric.label} className="flex justify-between items-center py-1">
                    <span className="text-xs text-muted-foreground">{metric.label}</span>
                    <span className={cn(
                      "text-sm font-medium",
                      hasValue ? (isGood ? "text-gain" : "text-foreground") : "text-muted-foreground"
                    )}>
                      {hasValue ? metric.format(metric.value!) : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Volatility */}
        {volatility !== null && volatility !== undefined && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Volatility</span>
              <span className="font-medium">{volatility.toFixed(1)}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
