import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Asset = Tables<'assets'>;

export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .order('market_cap', { ascending: false });
      
      if (error) throw error;
      return data as Asset[];
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });
}

export function useAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: ['asset', assetId],
    queryFn: async () => {
      if (!assetId) return null;
      
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('id', assetId)
        .single();
      
      if (error) throw error;
      return data as Asset;
    },
    enabled: !!assetId,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });
}
