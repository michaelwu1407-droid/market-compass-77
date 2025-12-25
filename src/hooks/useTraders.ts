import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Trader = Tables<'traders'>;

const TRADERS_PER_PAGE = 50;

export function useTraders() {
  return useInfiniteQuery({
    queryKey: ['traders'],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase
        .from('traders')
        .select('*')
        .order('copiers', { ascending: false })
        .range(pageParam * TRADERS_PER_PAGE, (pageParam + 1) * TRADERS_PER_PAGE - 1);

      if (error) throw error;
      
      return {
        data,
        nextPage: data.length < TRADERS_PER_PAGE ? undefined : pageParam + 1,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
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
