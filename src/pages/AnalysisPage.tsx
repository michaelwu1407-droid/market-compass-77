import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnalysisInput } from '@/components/analysis/AnalysisInput';
import { AnalysisResult } from '@/components/analysis/AnalysisResult';
import { toast } from '@/hooks/use-toast';
import type { Report, ReportType, Horizon } from '@/types';

// Mock API response
const mockAnalyse = async (data: {
  reportType: ReportType;
  assets: string[];
  traderIds: string[];
  horizon: Horizon;
  extraInstructions: string;
  outputMode: 'quick' | 'full';
}): Promise<Partial<Report>> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  const ticker = data.assets[0] || 'NVDA';
  
  return {
    title: `${ticker} Investment Analysis`,
    input_assets: data.assets,
    input_trader_ids: data.traderIds,
    horizon: data.horizon,
    summary: `Based on comprehensive analysis, ${ticker} presents a compelling investment opportunity with strong fundamentals and positive momentum. The company benefits from secular growth trends in AI infrastructure.`,
    upside_pct_estimate: 28,
    rating: 'buy',
    score_6m: 7.8,
    score_12m: 8.5,
    score_long_term: 9.1,
    raw_response: `## Executive Summary

${ticker} demonstrates strong competitive positioning in its core markets with expanding margins and robust revenue growth.

## Key Investment Thesis

**Strengths:**
- Market leadership in core segments
- Strong balance sheet with minimal debt
- Expanding addressable market

**Risks:**
- Valuation premium relative to peers
- Competition from well-funded rivals
- Regulatory uncertainty in key markets

## Recommendation

We recommend a **BUY** rating with a ${data.horizon} price target reflecting ${28}% upside from current levels.`,
  };
};

export default function AnalysisPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Partial<Report> | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (data: {
    reportType: ReportType;
    assets: string[];
    traderIds: string[];
    horizon: Horizon;
    extraInstructions: string;
    outputMode: 'quick' | 'full';
  }) => {
    setIsLoading(true);
    try {
      const response = await mockAnalyse(data);
      setResult(response);
      toast({
        title: 'Analysis Complete',
        description: 'Your investment analysis is ready.',
      });
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: 'Unable to complete the analysis. Please try again.',
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

  const handleStarForIC = () => {
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
        <AnalysisInput onSubmit={handleSubmit} isLoading={isLoading} />
        
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
