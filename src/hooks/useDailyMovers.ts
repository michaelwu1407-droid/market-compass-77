import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type DailyMover = Tables<'daily_movers'> & {
  assets: Tables<'assets'> | null;
};

export function useDailyMovers(date?: string) {
  return useQuery({
    queryKey: ['daily-movers', date],
    queryFn: async () => {
      let query = supabase
        .from('daily_movers')
        .select('*, assets(*)')
        .order('change_pct', { ascending: false });
      
      if (date) {
        query = query.eq('date', date);
      }
      
      const { data, error } = await query.limit(20);
      
      if (error) throw error;
      return data as DailyMover[];
    },
  });
}

export function useTodayMovers() {
  const today = new Date().toISOString().split('T')[0];
  return useDailyMovers(today);
}
