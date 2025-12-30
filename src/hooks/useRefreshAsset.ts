import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface RefreshAssetParams {
  assetId: string;
  symbol: string;
}

export function useRefreshAsset() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ assetId, symbol }: RefreshAssetParams) => {
      // Use external Supabase project for function invocations
      const { data, error } = await supabase.functions.invoke('refresh-asset', {
        body: { assetId, symbol, range: '5y' }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['asset', variables.assetId] });
      queryClient.invalidateQueries({ queryKey: ['asset-price-history', variables.assetId] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      
      toast.success(`Updated ${variables.symbol} with ${data.priceHistoryCount} price points`);
    },
    onError: (error: Error, variables) => {
      console.error('Failed to refresh asset:', error);
      toast.error(`Failed to refresh ${variables.symbol}: ${error.message}`);
    },
  });
}
