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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      db: {
        schema: 'public',
      },
    });

    // SQL to fix cron jobs
    const sql = `
-- Fix the sync-worker cron job with correct URL and ensure it's active
-- Remove old cron jobs
DELETE FROM cron.job WHERE jobname = 'invoke-sync-worker';

-- Schedule sync-worker to run every 2 minutes (more frequent for better processing)
SELECT cron.schedule(
    'invoke-sync-worker',
    '*/2 * * * *', -- Every 2 minutes
    $$
    SELECT net.http_post(
        url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker',
        headers:='{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M"}'::jsonb
    )
    $$
);

-- Schedule sync-traders to run every hour to discover new traders
SELECT cron.schedule(
    'discover-new-traders',
    '0 * * * *', -- Every hour
    $$
    SELECT net.http_post(
        url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs',
        headers:='{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M", "Content-Type": "application/json"}'::jsonb,
        body:='{"sync_traders": true}'::jsonb
    )
    $$
);
    `;

    console.log("Running cron migration...");
    
    // Execute SQL directly using the PostgREST client
    // We need to use the service role key which has admin access
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });

    if (!response.ok) {
      // Try alternative method - direct database connection via Supabase client
      // Since we can't easily run raw SQL, let's try using the Supabase management API
      // or we can create individual RPC calls
      
      // Alternative: Use pg_cron functions directly via RPC if available
      console.log("Trying alternative method...");
      
      // Delete old job
      try {
        await supabase.rpc('exec_sql', { 
          query: "DELETE FROM cron.job WHERE jobname = 'invoke-sync-worker';" 
        });
      } catch (e) {
        console.log("Note: exec_sql RPC may not exist, will try direct approach");
      }
      
      // For now, return instructions
      return new Response(JSON.stringify({ 
        success: false, 
        message: "Could not run SQL directly. Please run the migration manually in Supabase SQL Editor.",
        sql: sql,
        instructions: "Go to Supabase Dashboard > SQL Editor > Run the SQL from the migration file"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const result = await response.json();
    console.log("Cron migration successful:", result);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Cron jobs updated successfully! Sync-worker will run every 2 minutes, and trader discovery every hour.",
      result 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in run-cron-migration:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      message: "Could not run automatically. Please run the migration manually in Supabase SQL Editor.",
      sql_file: "supabase/migrations/20251225150000_fix_sync_worker_cron.sql"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

