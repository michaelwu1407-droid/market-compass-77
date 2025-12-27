import { useMutation } from '@tanstack/react-query';
import { lovableCloud } from '@/lib/lovableCloud';
import { useToast } from '@/hooks/use-toast';

interface AnalyseParams {
  trader_id?: string;
  asset_id?: string;
  analysis_type?: 'comprehensive' | 'quick' | 'risk';
}

interface AnalyseResult {
  success: boolean;
  report_id?: string;
  title?: string;
  content?: string;
  error?: string;
}

export function useAnalyse() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: AnalyseParams): Promise<AnalyseResult> => {
      // Use Lovable Cloud for function invocations (where edge functions are deployed)
      const { data, error } = await lovableCloud.functions.invoke('analyse', {
        body: params,
      });

      if (error) throw error;
      return data as AnalyseResult;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Analysis Complete',
          description: data.title || 'Your analysis report has been generated.',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Failed to generate analysis',
        variant: 'destructive',
      });
    },
  });
}
