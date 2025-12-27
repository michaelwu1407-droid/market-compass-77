// Lovable Cloud Supabase client for calling edge functions
// Edge functions are deployed on Lovable Cloud, not the external data project

import { createClient } from '@supabase/supabase-js';

const LOVABLE_CLOUD_URL = import.meta.env.VITE_SUPABASE_URL;
const LOVABLE_CLOUD_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const lovableCloud = createClient(LOVABLE_CLOUD_URL, LOVABLE_CLOUD_ANON_KEY);
