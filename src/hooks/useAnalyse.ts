import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
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
      // Use external Supabase project for function invocations
      const { data, error } = await supabase.functions.invoke('analyse', {
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
