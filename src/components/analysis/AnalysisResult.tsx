import { Save, Star, TrendingUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Report } from '@/types';
import { cn } from '@/lib/utils';
import { AnalysisQAChat } from './AnalysisQAChat';

interface AnalysisResultProps {
  report: Partial<Report>;
  reportId?: string;
  onSave?: () => void;
  onStarForIC?: () => void;
}

export function AnalysisResult({ report, reportId, onSave, onStarForIC }: AnalysisResultProps) {
  const ratingColors = {
    buy: 'bg-gain/10 text-gain border-gain',
    hold: 'bg-warning/10 text-warning border-warning',
    avoid: 'bg-loss/10 text-loss border-loss',
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl mb-2">{report.title}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {report.input_assets?.map(ticker => (
                <Badge key={ticker} variant="secondary">${ticker}</Badge>
              ))}
              {report.horizon && (
                <Badge variant="outline">{report.horizon} horizon</Badge>
              )}
              {report.rating && (
                <Badge className={cn("uppercase", ratingColors[report.rating])}>
                  {report.rating}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSave}>
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={onStarForIC}>
              <Star className="h-4 w-4 mr-1" />
              Star for IC
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {report.upside_pct_estimate !== null && report.upside_pct_estimate !== undefined && (
            <div className="stat-card">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3 w-3" />
                Upside Est.
              </div>
              <span className={cn("font-bold text-lg", report.upside_pct_estimate >= 0 ? "text-gain" : "text-loss")}>
                {report.upside_pct_estimate >= 0 ? '+' : ''}{report.upside_pct_estimate}%
              </span>
            </div>
          )}
          {report.score_6m !== null && report.score_6m !== undefined && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground mb-1">6M Score</div>
              <span className="font-bold text-lg">{report.score_6m}/10</span>
            </div>
          )}
          {report.score_12m !== null && report.score_12m !== undefined && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground mb-1">12M Score</div>
              <span className="font-bold text-lg">{report.score_12m}/10</span>
            </div>
          )}
          {report.score_long_term !== null && report.score_long_term !== undefined && (
            <div className="stat-card">
              <div className="text-xs text-muted-foreground mb-1">LT Score</div>
              <span className="font-bold text-lg">{report.score_long_term}/10</span>
            </div>
          )}
        </div>

        {/* Summary */}
        {report.summary && (
          <div className="p-4 bg-accent/50 rounded-lg border border-accent">
            <h4 className="font-semibold mb-2">Summary</h4>
            <p className="text-sm">{report.summary}</p>
          </div>
        )}

        {/* Full Response */}
        {report.raw_response && (
          <div className="prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ 
              __html: report.raw_response.replace(/\n/g, '<br/>').replace(/## /g, '<h2>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            }} />
          </div>
        )}

        {/* Q&A Chat */}
        <AnalysisQAChat report={report} reportId={reportId} />
      </CardContent>
    </Card>
  );
}
