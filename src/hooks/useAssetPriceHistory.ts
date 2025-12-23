import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PriceHistoryPoint {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export function useAssetPriceHistory(assetId: string | undefined) {
  return useQuery({
    queryKey: ['asset-price-history', assetId],
    queryFn: async () => {
      if (!assetId) return [];
      
      const { data, error } = await supabase
        .from('price_history')
        .select('date, close_price, open_price, high_price, low_price, volume')
        .eq('asset_id', assetId)
        .order('date', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map(row => ({
        date: row.date,
        price: Number(row.close_price) || 0,
        open: row.open_price ? Number(row.open_price) : undefined,
        high: row.high_price ? Number(row.high_price) : undefined,
        low: row.low_price ? Number(row.low_price) : undefined,
        volume: row.volume ? Number(row.volume) : undefined,
      })) as PriceHistoryPoint[];
    },
    enabled: !!assetId,
  });
}
