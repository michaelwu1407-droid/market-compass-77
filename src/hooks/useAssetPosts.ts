import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type AssetPost = Tables<'posts'> & {
  traders: Tables<'traders'> | null;
};

export function useAssetPosts(assetId: string | undefined) {
  return useQuery({
    queryKey: ['asset-posts', assetId],
    queryFn: async () => {
      if (!assetId) return [];
      
      // Find posts that mention this asset in mentioned_symbols or asset_ids
      const { data, error } = await supabase
        .from('posts')
        .select('*, traders(*)')
        .or(`asset_ids.cs.{${assetId}}`)
        .order('posted_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as AssetPost[];
    },
    enabled: !!assetId,
  });
}

export function useAssetHolders(assetId: string | undefined) {
  return useQuery({
    queryKey: ['asset-holders', assetId],
    queryFn: async () => {
      if (!assetId) return [];
      
      const { data, error } = await supabase
        .from('trader_holdings')
        .select('*, traders(*), assets(*)')
        .eq('asset_id', assetId)
        .order('allocation_pct', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!assetId,
  });
}
