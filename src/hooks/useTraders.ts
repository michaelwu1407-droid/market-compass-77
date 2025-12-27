import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/integrations/supabase/types';
import { useEffect } from 'react';

export type Trader = Tables<'traders'>;

const TRADERS_PER_PAGE = 50;

export function useTraders() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('traders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'traders' },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['traders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
