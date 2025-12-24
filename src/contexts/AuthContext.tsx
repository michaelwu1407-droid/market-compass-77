import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const setData = async (session: Session | null) => {
      setIsLoading(true);
      if (session?.user) {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .single(); // Use single() if one user has one role, or adjust if multiple

        if (error) {
          console.error('Error fetching user role:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(data?.role === 'admin');
        }
        
        setSession(session);
        setUser(session.user);

      } else {
        setSession(null);
        setUser(null);
        setIsAdmin(false);
      }
      setIsLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setData(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setData(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user,
    isAdmin,
    isLoading,
    signIn: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error as Error | null };
    },
    signUp: async (email: string, password: string, displayName?: string) => {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { display_name: displayName || email.split('@')[0] },
        },
      });
      return { error: error as Error | null };
    },
    signOut: () => supabase.auth.signOut(),
  };
  
  // Full screen loader
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
