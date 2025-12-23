import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TraderEquityPoint {
  id: string;
  trader_id: string;
  date: string;
  equity_value: number;
  benchmark_value: number | null;
  created_at: string;
}

export function useTraderEquityHistory(traderId: string | undefined) {
  return useQuery({
    queryKey: ['trader-equity-history', traderId],
    queryFn: async () => {
      if (!traderId) return [];
      
      const { data, error } = await supabase
        .from('trader_equity_history')
        .select('*')
        .eq('trader_id', traderId)
        .order('date', { ascending: true });
      
      if (error) throw error;
      return data as TraderEquityPoint[];
    },
    enabled: !!traderId,
  });
}
