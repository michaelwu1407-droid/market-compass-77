import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useSavedPosts() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['saved-posts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('saved_posts')
        .select('*, posts(*, traders(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useIsPostSaved(postId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['is-post-saved', postId, user?.id],
    queryFn: async () => {
      if (!user || !postId) return false;
      
      const { data, error } = await supabase
        .from('saved_posts')
        .select('id')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .maybeSingle();
      
      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!postId,
  });
}

export function useSavePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Must be logged in');
      
      const { error } = await supabase
        .from('saved_posts')
        .insert({ user_id: user.id, post_id: postId });
      
      if (error) throw error;
    },
    onSuccess: (_, postId) => {
      queryClient.invalidateQueries({ queryKey: ['saved-posts'] });
      queryClient.invalidateQueries({ queryKey: ['is-post-saved', postId] });
      toast.success('Post saved');
    },
    onError: () => {
      toast.error('Failed to save post');
    },
  });
}

export function useUnsavePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Must be logged in');
      
      const { error } = await supabase
        .from('saved_posts')
        .delete()
        .eq('user_id', user.id)
        .eq('post_id', postId);
      
      if (error) throw error;
    },
    onSuccess: (_, postId) => {
      queryClient.invalidateQueries({ queryKey: ['saved-posts'] });
      queryClient.invalidateQueries({ queryKey: ['is-post-saved', postId] });
      toast.success('Post unsaved');
    },
    onError: () => {
      toast.error('Failed to unsave post');
    },
  });
}
