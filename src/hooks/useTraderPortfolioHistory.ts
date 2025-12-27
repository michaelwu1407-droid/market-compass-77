import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface PortfolioHolding {
  symbol: string;
  value: number;
  name?: string;
}

export interface TraderPortfolioSnapshot {
  id: string;
  trader_id: string;
  date: string;
  holdings: PortfolioHolding[];
  created_at: string;
}

export function useTraderPortfolioHistory(traderId: string | undefined) {
  return useQuery({
    queryKey: ['trader-portfolio-history', traderId],
    queryFn: async () => {
      if (!traderId) return [];
      
      const { data, error } = await supabase
        .from('trader_portfolio_history')
        .select('*')
        .eq('trader_id', traderId)
        .order('date', { ascending: true });
      
      if (error) throw error;
      // Parse holdings from jsonb
      return (data || []).map(snapshot => ({
        ...snapshot,
        holdings: (Array.isArray(snapshot.holdings) ? snapshot.holdings : []) as unknown as PortfolioHolding[],
      })) as TraderPortfolioSnapshot[];
    },
    enabled: !!traderId,
  });
}
