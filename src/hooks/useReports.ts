import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface DBReport {
  id: string;
  title: string;
  content: string | null;
  report_type: string | null;
  status: string | null;
  starred_for_ic: boolean | null;
  ai_generated: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  trader_id: string | null;
  asset_id: string | null;
  input_assets: string[] | null;
  input_trader_ids: string[] | null;
  horizon: string | null;
  rating: string | null;
  upside_pct_estimate: number | null;
  score_6m: number | null;
  score_12m: number | null;
  score_long_term: number | null;
  summary: string | null;
  raw_response: string | null;
}

export function useReports(options?: { starredForIC?: boolean }) {
  return useQuery({
    queryKey: ['reports', options],
    queryFn: async () => {
      let query = supabase.from('reports').select('*').order('created_at', { ascending: false });
      
      if (options?.starredForIC) {
        query = query.eq('starred_for_ic', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as DBReport[];
    },
  });
}

export function useCreateReport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (report: Omit<Partial<DBReport>, 'id' | 'created_at' | 'updated_at'>) => {
      const insertData: Record<string, unknown> = { ...report };
      if (user?.id) insertData.created_by = user.id;
      
      const { data, error } = await supabase
        .from('reports')
        .insert(insertData as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'Failed to create report', variant: 'destructive' });
    },
  });
}

export function useUpdateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<DBReport>) => {
      const { data, error } = await supabase
        .from('reports')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'Failed to update report', variant: 'destructive' });
    },
  });
}
