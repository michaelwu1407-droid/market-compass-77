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
        const callerAuth = req.headers.get('authorization') || '';
        const callerApiKey = req.headers.get('apikey') || '';

    const body = await req.json();
    const { job_id } = body;
    console.log(`[process-sync-job] Received request for job_id: ${job_id}`);

    if (!job_id) {
        return new Response(JSON.stringify({ error: 'Missing job_id' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use native SUPABASE_URL when available; fall back to request origin.
    // This prevents createClient() from throwing "supabaseUrl is required" in environments
    // where SUPABASE_URL is not injected.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch the job first (read-only check)
    const { data: jobCheck, error: checkError } = await supabase
        .from('sync_jobs')
        .select('id, trader_id, job_type')
        .eq('id', job_id)
        .single();

    if (checkError || !jobCheck) {
        console.error(`[process-sync-job] Job ${job_id} check failed:`, checkError);
        // Return 200 so dispatch-sync-jobs can continue processing other jobs
        return new Response(JSON.stringify({ 
            success: false,
            error: `Job ${job_id} not found`, 
            details: checkError 
        }), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
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
        // Return 200 so dispatch-sync-jobs can continue processing other jobs
        return new Response(JSON.stringify({ 
            success: false,
            error: `Failed to claim job ${job_id}`, 
            details: fetchError 
        }), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
    }

    const { trader, job_type } = job;
    if (!trader || !trader.etoro_username) {
        console.error(`[process-sync-job] Trader missing for job ${job_id}`);
        await supabase.from('sync_jobs').update({ 
            status: 'failed', 
            finished_at: new Date().toISOString(), 
            error_message: 'Trader not found',
            retry_count: (job.retry_count || 0) + 1
        }).eq('id', job.id);
        // Return 200 so dispatch-sync-jobs can continue processing other jobs
        return new Response(JSON.stringify({ 
            success: false,
            error: 'Trader missing',
            job_id: job.id
        }), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
    }

    console.log(`[process-sync-job] Processing ${job_type} for ${trader.etoro_username}`);
    
    // Call sync-trader-details on same project
    const forwardedAuth = callerAuth || `Bearer ${supabaseAnonKey}`;
    const forwardedApiKey = callerApiKey || supabaseAnonKey;

    const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-trader-details`, {
        method: 'POST',
        headers: {
            'Authorization': forwardedAuth,
            'apikey': forwardedApiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: trader.etoro_username, job_type: job_type || 'deep_sync' }),
    });
    
    let syncData = null;
    let syncError = null;
    
    if (!syncResponse.ok) {
        syncError = { message: `HTTP ${syncResponse.status}: ${await syncResponse.text()}` };
    } else {
        syncData = await syncResponse.json();
    }

    if (syncError) {
        console.error(`[process-sync-job] Error syncing details for ${trader.etoro_username}:`, syncError);
        const errorMsg = typeof syncError === 'string' ? syncError : (syncError.message || JSON.stringify(syncError));
        await supabase.from('sync_jobs').update({ 
            status: 'failed', 
            finished_at: new Date().toISOString(), 
            error_message: errorMsg || 'Error invoking sync-trader-details',
            retry_count: (job.retry_count || 0) + 1
        }).eq('id', job.id);
        
        // Return 200 with error details so dispatch-sync-jobs can continue processing other jobs
        return new Response(JSON.stringify({ 
            success: false,
            error: 'Sync failed', 
            details: errorMsg,
            job_id: job.id
        }), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
    }

    // Check if the sync function itself reported failure despite successful invocation
    if (syncData && syncData.success === false) {
         console.error(`[process-sync-job] Sync reported failure for ${trader.etoro_username}:`, syncData.error);
         await supabase.from('sync_jobs').update({ 
            status: 'failed', 
            finished_at: new Date().toISOString(), 
            error_message: syncData.error || 'Sync function reported failure',
            retry_count: (job.retry_count || 0) + 1
        }).eq('id', job.id);
        // Return 200 with error details so dispatch-sync-jobs can continue processing other jobs
        return new Response(JSON.stringify({ 
            success: false,
            error: 'Sync reported failure', 
            details: syncData,
            job_id: job.id
        }), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
    }

    // 3. Mark job as complete
        // Mark job as complete; support both finished_at and completed_at columns.
        const finishedAt = new Date().toISOString();
        const { error: completeErr } = await supabase
            .from('sync_jobs')
            .update({ status: 'completed', finished_at: finishedAt, completed_at: finishedAt })
            .eq('id', job.id);

        if (completeErr) {
            // Older schema may not have completed_at/finished_at.
            await supabase.from('sync_jobs').update({ status: 'completed' }).eq('id', job.id);
        }
    console.log(`[process-sync-job] Successfully processed job ${job.id}`);

    return new Response(JSON.stringify({ success: true, job_id: job.id, message: `Synced ${trader.etoro_username}`, data: syncData }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[process-sync-job] Fatal error:", error);
    // Return 200 so dispatch-sync-jobs can continue processing other jobs
    return new Response(JSON.stringify({ 
        success: false,
        error: error?.message || error?.toString() || 'Unknown error', 
        stack: error?.stack 
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Always return 200 so caller can see error details
    });
  }
});
