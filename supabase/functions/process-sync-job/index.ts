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
    const body = await req.json();
    const { job_id } = body;
    console.log(`[process-sync-job] Received request for job_id: ${job_id}`);

    if (!job_id) {
        return new Response(JSON.stringify({ error: 'Missing job_id' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch the job first (read-only check)
    const { data: jobCheck, error: checkError } = await supabase
        .from('sync_jobs')
        .select('id, trader_id')
        .eq('id', job_id)
        .single();

    if (checkError || !jobCheck) {
        console.error(`[process-sync-job] Job ${job_id} check failed:`, checkError);
        return new Response(JSON.stringify({ error: `Job ${job_id} not found`, details: checkError }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Claim the job
    const { data: job, error: fetchError } = await supabase
        .from('sync_jobs')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', job_id)
        .select('*, trader:traders(id, etoro_username)')
        .single();

    if (fetchError || !job) {
        console.error(`[process-sync-job] Failed to claim job ${job_id}:`, fetchError);
        return new Response(JSON.stringify({ error: `Failed to claim job ${job_id}`, details: fetchError }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { trader, job_type } = job;
    if (!trader || !trader.etoro_username) {
        console.error(`[process-sync-job] Trader missing for job ${job_id}`);
        await supabase.from('sync_jobs').update({ status: 'failed', finished_at: new Date().toISOString(), error_message: 'Trader not found' }).eq('id', job.id);
        return new Response(JSON.stringify({ error: 'Trader missing' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[process-sync-job] Processing ${job_type} for ${trader.etoro_username}`);
    
    // Simulate work for now to verify the pipeline works
    // We will uncomment the API call later
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Mark job as complete
    await supabase.from('sync_jobs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', job.id);
    console.log(`[process-sync-job] Successfully processed job ${job.id}`);

    return new Response(JSON.stringify({ success: true, job_id: job.id, message: `Synced ${trader.etoro_username}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[process-sync-job] Fatal error:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
    });
  }
});