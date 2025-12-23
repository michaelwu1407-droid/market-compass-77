import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFollowedTraders } from './useFollowedTraders';

export function useFollowedTradersAssets() {
  const { followedTraderIds, isLoading: followsLoading } = useFollowedTraders();

  const { data: followedAssetIds = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['followed-traders-assets', followedTraderIds],
    queryFn: async () => {
      if (followedTraderIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('trader_holdings')
        .select('asset_id')
        .in('trader_id', followedTraderIds);
      
      if (error) throw error;
      
      // Return unique asset IDs
      const uniqueAssetIds = [...new Set(data.map(h => h.asset_id).filter(Boolean))];
      return uniqueAssetIds as string[];
    },
    enabled: followedTraderIds.length > 0,
  });

  return {
    followedAssetIds,
    isLoading: followsLoading || assetsLoading,
  };
}
