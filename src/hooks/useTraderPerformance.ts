import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/integrations/supabase/types';

export type TraderPerformance = Tables<'trader_performance'>;

export function useTraderPerformance(traderId: string | undefined) {
  return useQuery({
    queryKey: ['trader-performance', traderId],
    queryFn: async () => {
      if (!traderId) return [];
      
      const { data, error } = await supabase
        .from('trader_performance')
        .select('*')
        .eq('trader_id', traderId)
        .order('year', { ascending: true })
        .order('month', { ascending: true });
      
      if (error) throw error;
      return data as TraderPerformance[];
    },
    enabled: !!traderId,
  });
}
