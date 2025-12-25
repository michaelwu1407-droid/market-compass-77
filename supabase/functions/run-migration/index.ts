
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // SQL to add missing columns to sync_jobs
    const sql = `
      ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
      ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
      ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
      ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
    `;

    console.log("Running schema migration...");
    const { error } = await supabase.rpc('run_sql', { sql });
    
    if (error) {
        console.error("Migration failed:", error);
        // Fallback: Try running via raw SQL query if RPC fails (some setups support this differently)
        // But for now, let's assume RPC is the way or we catch the error.
        return new Response(JSON.stringify({ success: false, error: error }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log("Schema migration successful.");

    return new Response(JSON.stringify({ success: true, message: "Schema updated: Added missing columns to sync_jobs" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in run-migration:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
