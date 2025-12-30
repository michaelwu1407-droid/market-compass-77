// Custom Supabase client pointing to the external project xgvaibxxiwfraklfbwey
// This bypasses the auto-generated Lovable Cloud client

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xgvaibxxiwfraklfbwey.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  // Don't crash the whole app on misconfigured deployments; allow the UI to render and
  // surface errors via normal request failures / error boundaries.
  console.error('Missing VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});

export { SUPABASE_URL, SUPABASE_ANON_KEY };
