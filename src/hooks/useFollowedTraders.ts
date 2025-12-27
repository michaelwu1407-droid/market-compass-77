import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export function useFollowedTraders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: followedTraderIds = [], isLoading, error } = useQuery({
    queryKey: ['followed-traders', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('user_follows')
        .select('trader_id')
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data.map(f => f.trader_id);
    },
    enabled: !!user,
  });

  const followMutation = useMutation({
    mutationFn: async (traderId: string) => {
      if (!user) throw new Error('Must be logged in');
      
      const { error } = await supabase
        .from('user_follows')
        .insert({ user_id: user.id, trader_id: traderId });
      
      if (error) throw error;
    },
    onMutate: async (traderId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['followed-traders', user?.id] });
      const previous = queryClient.getQueryData(['followed-traders', user?.id]);
      queryClient.setQueryData(['followed-traders', user?.id], (old: string[] = []) => [...old, traderId]);
      return { previous };
    },
    onError: (err, traderId, context) => {
      queryClient.setQueryData(['followed-traders', user?.id], context?.previous);
      toast({ title: 'Error', description: 'Failed to follow trader', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['followed-traders', user?.id] });
    },
    onSuccess: () => {
      toast({ title: 'Following', description: 'You are now following this trader' });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (traderId: string) => {
      if (!user) throw new Error('Must be logged in');
      
      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('user_id', user.id)
        .eq('trader_id', traderId);
      
      if (error) throw error;
    },
    onMutate: async (traderId) => {
      await queryClient.cancelQueries({ queryKey: ['followed-traders', user?.id] });
      const previous = queryClient.getQueryData(['followed-traders', user?.id]);
      queryClient.setQueryData(['followed-traders', user?.id], (old: string[] = []) => 
        old.filter(id => id !== traderId)
      );
      return { previous };
    },
    onError: (err, traderId, context) => {
      queryClient.setQueryData(['followed-traders', user?.id], context?.previous);
      toast({ title: 'Error', description: 'Failed to unfollow trader', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['followed-traders', user?.id] });
    },
    onSuccess: () => {
      toast({ title: 'Unfollowed', description: 'You are no longer following this trader' });
    },
  });

  const isFollowing = (traderId: string) => followedTraderIds.includes(traderId);
  
  const toggleFollow = (traderId: string) => {
    if (isFollowing(traderId)) {
      unfollowMutation.mutate(traderId);
    } else {
      followMutation.mutate(traderId);
    }
  };

  return {
    followedTraderIds,
    isLoading,
    error,
    isFollowing,
    toggleFollow,
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
  };
}
