import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
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
        .select(
          `id, content, posted_at, created_at, trader_id,
           poster_id, poster_first, poster_last, poster_avatar,
           likes, comments, like_count, comment_count,
           etoro_post_id, etoro_username, raw_json,
           traders(*)`
        )
        .order('posted_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Post[];
    },
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
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
