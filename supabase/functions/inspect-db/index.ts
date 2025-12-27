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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    if (body.query) {
       // WARNING: DANGEROUS - FOR DEBUGGING ONLY
       // This allows running raw SQL if the function has permissions (it likely doesn't via postgres-js but tries via RPC if enabled, or we simulate)
       // Actually, supabase-js doesn't support raw query execution easily unless we use rpc.
       // Let's just fallback to the standard inspection if no specific query or if query is not supported.
       
       // Instead of raw query, let's just inspect columns of sync_jobs
       if (body.query.includes('information_schema')) {
           // We can't query information_schema easily via postgrest.
           // Let's try to select * from sync_jobs limit 1 and return keys
           const { data, error } = await supabase.from('sync_jobs').select('*').limit(1);
           return new Response(JSON.stringify({ 
               columns: data && data.length > 0 ? Object.keys(data[0]) : [],
               error: error 
           }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
       }
    }

    // 1. Count Traders
    const { count: traderCount, error: traderError } = await supabase
      .from('traders')
      .select('*', { count: 'exact', head: true });

    // 2. Count Sync Jobs by Status
    const { data: jobStats, error: jobError } = await supabase
      .from('sync_jobs')
      .select('status');
    
    const jobsByStatus = jobStats?.reduce((acc: any, curr) => {
        acc[curr.status] = (acc[curr.status] || 0) + 1;
        return acc;
    }, {});

    // 3. Check for recent errors in sync_jobs
    const { data: recentErrors } = await supabase
        .from('sync_jobs')
        .select('error_message, updated_at')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(5);

    return new Response(JSON.stringify({
      trader_count: traderCount,
      jobs_total: jobStats?.length,
      jobs_by_status: jobsByStatus,
      recent_errors: recentErrors,
      db_errors: { trader: traderError, job: jobError }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});