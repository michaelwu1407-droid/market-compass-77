import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type TradeWithRelations = Tables<'trades'> & {
  traders: Tables<'traders'> | null;
  assets: Tables<'assets'> | null;
};

export function useRecentTrades(limit = 20) {
  return useQuery({
    queryKey: ['recent-trades', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trades')
        .select('*, traders(*), assets(*)')
        .order('executed_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as TradeWithRelations[];
    },
  });
}

export function useTradesByTraderIds(traderIds: string[]) {
  return useQuery({
    queryKey: ['trades-by-traders', traderIds],
    queryFn: async () => {
      if (!traderIds.length) return [];
      
      const { data, error } = await supabase
        .from('trades')
        .select('*, traders(*), assets(*)')
        .in('trader_id', traderIds)
        .order('executed_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as TradeWithRelations[];
    },
    enabled: traderIds.length > 0,
  });
}
