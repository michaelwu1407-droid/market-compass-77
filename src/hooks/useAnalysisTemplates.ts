import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface TemplateSection {
  id: string;
  title: string;
  prompt: string;
  required: boolean;
}

export interface AnalysisTemplate {
  id: string;
  name: string;
  description: string | null;
  sections: TemplateSection[];
  is_default: boolean | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useAnalysisTemplates() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['analysis-templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analysis_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');
      
      if (error) throw error;
      
      // Transform the data to match our interface
      return (data || []).map(template => ({
        ...template,
        sections: (template.sections as unknown as TemplateSection[]) || [],
      })) as AnalysisTemplate[];
    },
    enabled: !!user,
  });
}

export function useCreateTemplate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: { name: string; description?: string; sections: TemplateSection[] }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('analysis_templates')
        .insert({
          name: template.name,
          description: template.description || null,
          sections: template.sections as unknown as Json,
          user_id: user.id,
          is_default: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-templates'] });
      toast({ title: 'Template created', description: 'Your analysis template has been saved.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create template', variant: 'destructive' });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('analysis_templates')
        .delete()
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-templates'] });
      toast({ title: 'Template deleted' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
    },
  });
}
