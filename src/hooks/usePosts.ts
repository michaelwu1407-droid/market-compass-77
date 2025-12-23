import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Post = Tables<'posts'> & {
  traders: Tables<'traders'> | null;
};

export function usePosts() {
  return useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*, traders(*)')
        .order('posted_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Post[];
    },
  });
}

export function useTraderPosts(traderId: string | undefined) {
  return useQuery({
    queryKey: ['trader-posts', traderId],
    queryFn: async () => {
      if (!traderId) return [];
      
      const { data, error } = await supabase
        .from('posts')
        .select('*, traders(*)')
        .eq('trader_id', traderId)
        .order('posted_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as Post[];
    },
    enabled: !!traderId,
  });
}
