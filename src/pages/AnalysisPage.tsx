import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnalysisInput } from '@/components/analysis/AnalysisInput';
import { AnalysisResult } from '@/components/analysis/AnalysisResult';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUpdateReport } from '@/hooks/useReports';
import { useTrader } from '@/hooks/useTraders';
import type { Report, ReportType, Horizon } from '@/types';

export default function AnalysisPage() {
  const [searchParams] = useSearchParams();
  const preselectedTraderId = searchParams.get('trader');
  
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Partial<Report> | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const navigate = useNavigate();
  const updateReport = useUpdateReport();

  // Fetch preselected trader details
  const { data: preselectedTrader } = useTrader(preselectedTraderId || undefined);

  const handleSubmit = async (data: {
    reportType: ReportType;
    assets: string[];
    traderIds: string[];
    horizon: Horizon;
    extraInstructions: string;
    outputMode: 'quick' | 'full';
  }) => {
    setIsLoading(true);
    setResult(null);
    
    try {
      const { data: response, error } = await supabase.functions.invoke('analyse', {
        body: {
          reportType: data.reportType,
          assets: data.assets,
          traderIds: data.traderIds,
          horizon: data.horizon,
          extraInstructions: data.extraInstructions,
          outputMode: data.outputMode,
        },
      });

      if (error) throw error;
      
      if (!response.success) {
        throw new Error(response.error || 'Analysis failed');
      }

      setReportId(response.report_id);
      setResult({
        title: response.title,
        input_assets: data.assets,
        input_trader_ids: data.traderIds,
        horizon: data.horizon,
        summary: response.summary,
        upside_pct_estimate: response.upside_pct_estimate,
        rating: response.rating,
        score_6m: response.score_6m,
        score_12m: response.score_12m,
        score_long_term: response.score_long_term,
        raw_response: response.raw_response,
      });
      
      toast({
        title: 'Analysis Complete',
        description: 'Your investment analysis is ready.',
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Unable to complete the analysis. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    toast({
      title: 'Report Saved',
      description: 'The report has been saved to your library.',
    });
  };

  const handleStarForIC = async () => {
    if (reportId) {
      await updateReport.mutateAsync({ id: reportId, starred_for_ic: true });
    }
    toast({
      title: 'Starred for IC',
      description: 'Report added to Investment Committee queue.',
    });
    navigate('/ic');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Analysis Engine</h1>
        <p className="text-muted-foreground">Generate AI-powered investment reports on stocks, traders, or baskets</p>
      </div>

      <div className="grid gap-6">
        <AnalysisInput 
          onSubmit={handleSubmit} 
          isLoading={isLoading}
          preselectedTrader={preselectedTrader ? {
            id: preselectedTrader.id,
            display_name: preselectedTrader.display_name,
            etoro_username: preselectedTrader.etoro_username,
            avatar_url: preselectedTrader.avatar_url,
          } : undefined}
        />
        
        {result && (
          <AnalysisResult 
            report={result} 
            onSave={handleSave}
            onStarForIC={handleStarForIC}
          />
        )}
      </div>
    </div>
  );
}