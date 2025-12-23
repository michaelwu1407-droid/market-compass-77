import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Trader = Tables<'traders'>;

export function useTraders() {
  return useQuery({
    queryKey: ['traders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traders')
        .select('*')
        .order('copiers', { ascending: false });
      
      if (error) throw error;
      return data as Trader[];
    },
  });
}

export function useTrader(traderId: string | undefined) {
  return useQuery({
    queryKey: ['trader', traderId],
    queryFn: async () => {
      if (!traderId) return null;
      
      const { data, error } = await supabase
        .from('traders')
        .select('*')
        .eq('id', traderId)
        .single();
      
      if (error) throw error;
      return data as Trader;
    },
    enabled: !!traderId,
  });
}

export function useTraderByUsername(username: string | undefined) {
  return useQuery({
    queryKey: ['trader-username', username],
    queryFn: async () => {
      if (!username) return null;
      
      const { data, error } = await supabase
        .from('traders')
        .select('*')
        .eq('etoro_username', username)
        .single();
      
      if (error) throw error;
      return data as Trader;
    },
    enabled: !!username,
  });
}
