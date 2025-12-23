import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type TraderHolding = Tables<'trader_holdings'> & {
  assets: Tables<'assets'> | null;
};

export function useTraderHoldings(traderId: string | undefined) {
  return useQuery({
    queryKey: ['trader-holdings', traderId],
    queryFn: async () => {
      if (!traderId) return [];
      
      // Order by current_value as fallback since API often stores allocation there
      const { data, error } = await supabase
        .from('trader_holdings')
        .select('*, assets(*)')
        .eq('trader_id', traderId)
        .order('current_value', { ascending: false });
      
      if (error) throw error;
      return data as TraderHolding[];
    },
    enabled: !!traderId,
  });
}
