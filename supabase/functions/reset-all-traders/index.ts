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

    // Get confirmation from request body
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== 'DELETE_ALL_TRADERS') {
      return new Response(JSON.stringify({
        error: 'Safety check failed. Must include { "confirm": "DELETE_ALL_TRADERS" } in request body.'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      });
    }

    console.log("RESET: Starting complete trader data reset...");

    // 1. Delete all sync jobs
    const { count: jobsBefore } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true });
    
    const { error: deleteJobsError } = await supabase
      .from('sync_jobs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteJobsError) {
      console.error("Error deleting sync_jobs:", deleteJobsError);
      throw deleteJobsError;
    }

    // 2. Delete all trader holdings
    const { error: deleteHoldingsError } = await supabase
      .from('trader_holdings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteHoldingsError) {
      console.error("Error deleting trader_holdings:", deleteHoldingsError);
      throw deleteHoldingsError;
    }

    // 3. Delete all traders
    const { count: tradersBefore } = await supabase
      .from('traders')
      .select('*', { count: 'exact', head: true });
    
    const { error: deleteTradersError } = await supabase
      .from('traders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteTradersError) {
      console.error("Error deleting traders:", deleteTradersError);
      throw deleteTradersError;
    }

    console.log(`RESET: Deleted ${tradersBefore || 0} traders, ${jobsBefore || 0} jobs, and all holdings`);

    return new Response(JSON.stringify({
      success: true,
      message: "All trader data reset successfully",
      deleted: {
        traders: tradersBefore || 0,
        sync_jobs: jobsBefore || 0,
        trader_holdings: "all"
      },
      next_steps: [
        "Call enqueue-sync-jobs with { sync_traders: true } to discover new traders",
        "Or wait for discover-traders workflow to run (every hour)"
      ]
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error: any) {
    console.error("RESET ERROR:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || error?.toString() || 'Unknown error',
      stack: error?.stack
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});

