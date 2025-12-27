import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/integrations/supabase/types';

export type Trade = Tables<'trades'> & {
  assets: Tables<'assets'> | null;
  open_price: number | null;
  close_price: number | null;
  profit_loss_pct: number | null;
  open_date: string | null;
  position_id: number | null;
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
        .limit(100);
      
      if (error) throw error;
      return data as Trade[];
    },
    enabled: !!traderId,
  });
}
