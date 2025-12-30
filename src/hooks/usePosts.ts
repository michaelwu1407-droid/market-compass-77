import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/integrations/supabase/types';

export type Post = Tables<'posts'> & {
  traders: Tables<'traders'> | null;
  // Some environments include these columns on `posts` (ingested by scrape-posts).
  // Keep optional so we can safely fall back when absent.
  poster_avatar?: string | null;
  poster_first?: string | null;
  poster_last?: string | null;
};

export function usePosts() {
  return useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const baseSelect =
        `id, trader_id, content, asset_ids, mentioned_symbols,
         likes, comments, shares, sentiment, source,
         etoro_post_id, posted_at, created_at, etoro_username,
         traders:traders!posts_trader_id_fkey(*)`;

      const selectWithPoster =
        `id, trader_id, content, asset_ids, mentioned_symbols,
         likes, comments, shares, sentiment, source,
         etoro_post_id, posted_at, created_at, etoro_username,
         poster_avatar, poster_first, poster_last,
         traders:traders!posts_trader_id_fkey(*)`;

      // Prefer poster_* columns when present, but fall back if the DB schema doesn't have them.
      const primary = await supabase
        .from('posts')
        .select(selectWithPoster)
        .order('posted_at', { ascending: false })
        .limit(50);

      if (!primary.error) return primary.data as Post[];

      const msg = (primary.error as any)?.message || '';
      const code = (primary.error as any)?.code || '';
      const missingColumn = code === '42703' || /column .* does not exist/i.test(msg);
      if (!missingColumn) throw primary.error;

      const fallback = await supabase
        .from('posts')
        .select(baseSelect)
        .order('posted_at', { ascending: false })
        .limit(50);

      if (fallback.error) throw fallback.error;
      return fallback.data as Post[];
    },
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
  });
}

export function useTraderPosts(traderId: string | undefined, etoroUsername?: string | null) {
  return useQuery({
    queryKey: ['trader-posts', traderId, etoroUsername ?? null],
    queryFn: async () => {
      const select = '*, traders:traders!posts_trader_id_fkey(*)';

      // Primary path: posts are linked to the trader via trader_id.
      if (traderId) {
        const { data, error } = await supabase
          .from('posts')
          .select(select)
          .eq('trader_id', traderId)
          .order('posted_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        if ((data?.length ?? 0) > 0) return data as Post[];
      }

      // Fallback path: some environments ingest posts with etoro_username but do not backfill trader_id.
      const normalized = (etoroUsername || '').trim().toLowerCase();
      if (!normalized) return [];

      const { data, error } = await supabase
        .from('posts')
        .select(select)
        .ilike('etoro_username', normalized)
        .order('posted_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as Post[];
    },
    enabled: !!traderId || !!(etoroUsername && etoroUsername.trim()),
  });
}
