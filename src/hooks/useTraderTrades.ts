import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Trade = Tables<'trades'> & {
  assets: Tables<'assets'> | null;
};

export function useTraderTrades(traderId: string | undefined) {
  return useQuery({
    queryKey: ['trader-trades', traderId],
    queryFn: async () => {
      if (!traderId) return [];
      
      const { data, error } = await supabase
        .from('trades')
        .select('*, assets(*)')
        .eq('trader_id', traderId)
        .order('executed_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Trade[];
    },
    enabled: !!traderId,
  });
}
