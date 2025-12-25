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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});