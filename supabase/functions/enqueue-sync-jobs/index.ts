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
    const { sync_traders = false, trader_ids: specific_trader_ids, force = false } = await req.json().catch(() => ({}));
    
    // Use native SUPABASE_URL - functions are deployed on this project
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (sync_traders) {
      console.log('sync_traders is true, invoking sync-traders function');
      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-traders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (!syncResponse.ok) {
        return new Response(JSON.stringify({ error: "Failed to invoke sync-traders" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500
        });
      }
      
      const syncResult = await syncResponse.json();
      return new Response(JSON.stringify({ message: `Sync completed`, sync_result: syncResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get ALL traders
    console.log("Fetching ALL traders from database...");
    let allTraderIds: string[] = [];
    
    if (specific_trader_ids && specific_trader_ids.length > 0) {
      allTraderIds = specific_trader_ids;
    } else {
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageTraders, error } = await supabase
          .from('traders')
          .select('id')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error || !pageTraders?.length) break;
        pageTraders.forEach(t => allTraderIds.push(t.id));
        page++;
        hasMore = pageTraders.length === pageSize;
      }
    }

    if (allTraderIds.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No traders found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const jobsToInsert = allTraderIds.map(trader_id => ({ trader_id, status: 'pending', job_type: 'deep_sync' }));
    const batchSize = 500;
    let actualInserted = 0;

    for (let i = 0; i < jobsToInsert.length; i += batchSize) {
      const batch = jobsToInsert.slice(i, i + batchSize);
      const { data } = await supabase.from('sync_jobs').insert(batch).select('id');
      actualInserted += data?.length || 0;
    }

    const { count: pendingCount } = await supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    return new Response(JSON.stringify({
      success: true,
      traders_found: allTraderIds.length,
      jobs_created: actualInserted,
      pending_jobs_total: pendingCount || 0
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500
    });
  }
});
