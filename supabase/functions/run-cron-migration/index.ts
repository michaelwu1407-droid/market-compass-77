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

    // SQL to fix cron jobs (legacy pg_cron path). Do not embed secrets.
    const sql = `
  -- Fix the sync-worker cron job with correct URL and ensure it's active
  -- Remove old cron jobs
  DELETE FROM cron.job WHERE jobname = 'invoke-sync-worker';

  -- Schedule sync-worker to run every 2 minutes
  SELECT cron.schedule(
    'invoke-sync-worker',
    '*/2 * * * *',
    $$
    SELECT net.http_post(
      url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker',
      headers:='{}'::jsonb
    )
    $$
  );

  -- Schedule discover-new-traders to run every hour
  SELECT cron.schedule(
    'discover-new-traders',
    '0 * * * *',
    $$
    SELECT net.http_post(
      url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs',
      headers:='{ "Content-Type": "application/json"}'::jsonb,
      body:='{"sync_traders": true}'::jsonb
    )
    $$
  );
    `;

    console.log("Running cron migration...");
    
    // Use Supabase client with service role to execute SQL via RPC
    // First, try to delete old jobs
    try {
      // Delete old cron jobs
      const { error: deleteError1 } = await supabase.rpc('exec_sql', {
        query: "DELETE FROM cron.job WHERE jobname = 'invoke-sync-worker';"
      });
      
      const { error: deleteError2 } = await supabase.rpc('exec_sql', {
        query: "DELETE FROM cron.job WHERE jobname = 'discover-new-traders';"
      });
      
      if (deleteError1 || deleteError2) {
        console.log("Note: Could not delete old jobs (may not exist)", deleteError1 || deleteError2);
      }
    } catch (e) {
      console.log("Note: exec_sql RPC may not exist, continuing...");
    }
    
    // Create sync-worker cron job
    const syncWorkerSQL = `
      SELECT cron.schedule(
        'invoke-sync-worker',
        '*/2 * * * *',
        $func$SELECT net.http_post(url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker', headers:='{}'::jsonb)$func$
      );
    `;
    
    // Create discover-new-traders cron job
    const discoverTradersSQL = `
      SELECT cron.schedule(
        'discover-new-traders',
        '0 * * * *',
        $func$SELECT net.http_post(url:='https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs', headers:='{ "Content-Type": "application/json"}'::jsonb, body:='{"sync_traders": true}'::jsonb)$func$
      );
    `;
    
    // Try executing via direct database connection
    // Since we have service role, we can use the PostgREST API with proper headers
    const results = [];
    
    try {
      // Execute via Supabase REST API with service role
      const response1 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: syncWorkerSQL }),
      });
      
      if (response1.ok) {
        results.push('sync-worker scheduled');
      } else {
        const errorText = await response1.text();
        throw new Error(`Failed to schedule sync-worker: ${errorText}`);
      }
      
      const response2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: discoverTradersSQL }),
      });
      
      if (response2.ok) {
        results.push('discover-new-traders scheduled');
      } else {
        const errorText = await response2.text();
        throw new Error(`Failed to schedule discover-new-traders: ${errorText}`);
      }
      
      console.log("Cron migration successful:", results);

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Cron jobs updated successfully! Sync-worker will run every 2 minutes, and trader discovery every hour.",
        results 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (sqlError: any) {
      // If exec_sql RPC doesn't exist, we need to use a different approach
      console.log("exec_sql RPC not available, trying alternative...");
      
      // Alternative: We need to grant the user permission or use a different method
      // For now, provide clear instructions
      return new Response(JSON.stringify({ 
        success: false,
        error: sqlError.message,
        message: "Cannot run SQL automatically. You need to grant permissions or use Supabase CLI.",
        instructions: [
          "Option 1: Use Supabase CLI (recommended):",
          "  supabase db push",
          "",
          "Option 2: Grant permissions in SQL Editor (run as superuser):",
          "  GRANT ALL ON cron.job TO postgres;",
          "  Then run the migration SQL again",
          "",
          "Option 3: Contact Supabase support to enable cron job management"
        ],
        sql_file: "supabase/migrations/20251225150000_fix_sync_worker_cron.sql"
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

