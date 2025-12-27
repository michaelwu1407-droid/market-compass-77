import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface DataDiscrepancy {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  field_name: string;
  bullaware_value: string | null;
  firecrawl_value: string | null;
  difference_pct: number | null;
  value_used: string;
  status: string;
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export function useDiscrepancies(filters?: {
  status?: string;
  entityType?: string;
}) {
  return useQuery({
    queryKey: ['discrepancies', filters],
    queryFn: async () => {
      let query = supabase
        .from('data_discrepancies')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.entityType && filters.entityType !== 'all') {
        query = query.eq('entity_type', filters.entityType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DataDiscrepancy[];
    },
  });
}

export function useDiscrepancyStats() {
  return useQuery({
    queryKey: ['discrepancy-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_discrepancies')
        .select('status, entity_type, field_name');

      if (error) throw error;

      const stats = {
        total: data.length,
        pending: data.filter(d => d.status === 'pending_review').length,
        reviewed: data.filter(d => d.status === 'reviewed').length,
        dismissed: data.filter(d => d.status === 'dismissed').length,
        byEntityType: {} as Record<string, number>,
        byField: {} as Record<string, number>,
      };

      for (const d of data) {
        stats.byEntityType[d.entity_type] = (stats.byEntityType[d.entity_type] || 0) + 1;
        stats.byField[d.field_name] = (stats.byField[d.field_name] || 0) + 1;
      }

      return stats;
    },
  });
}

export function useUpdateDiscrepancy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status?: string;
      notes?: string;
    }) => {
      const updates: Record<string, any> = {};
      if (status) {
        updates.status = status;
        if (status === 'reviewed' || status === 'dismissed') {
          updates.reviewed_at = new Date().toISOString();
        }
      }
      if (notes !== undefined) {
        updates.notes = notes;
      }

      const { data, error } = await supabase
        .from('data_discrepancies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['discrepancy-stats'] });
    },
  });
}

export function useBulkUpdateDiscrepancies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      status,
    }: {
      ids: string[];
      status: string;
    }) => {
      const updates: Record<string, any> = { status };
      if (status === 'reviewed' || status === 'dismissed') {
        updates.reviewed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('data_discrepancies')
        .update(updates)
        .in('id', ids)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['discrepancy-stats'] });
    },
  });
}
