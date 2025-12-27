import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_ITERATIONS = 100;
const DELAY_BETWEEN_BATCHES = 2000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const maxIterations = body.max_iterations || MAX_ITERATIONS;
    const delayMs = body.delay_ms || DELAY_BETWEEN_BATCHES;

    // Use native SUPABASE_URL - functions are deployed on this project
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const stats = {
      iterations: 0,
      total_dispatched: 0,
      total_processed: 0,
      errors: [] as any[],
      start_time: new Date().toISOString(),
      end_time: null as string | null
    };

    console.log("Starting force-process-queue...");

    const { count: initialPending } = await supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { count: initialInProgress } = await supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'in_progress');
    const { count: initialFailed } = await supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed');

    console.log(`Found ${initialPending} pending, ${initialInProgress} in_progress, ${initialFailed} failed jobs initially.`);
    
    if ((initialPending || 0) === 0 && (initialInProgress || 0) === 0) {
      console.log("No pending or in-progress jobs found. Attempting to enqueue jobs...");
      try {
        const enqueueResponse = await fetch(`${supabaseUrl}/functions/v1/enqueue-sync-jobs`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true }),
        });
        if (enqueueResponse.ok) {
          const enqueueResult = await enqueueResponse.json();
          console.log("Enqueued jobs result:", enqueueResult);
        }
      } catch (e) {
        console.error("Exception while enqueueing:", e);
      }
    }
    
    const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase.from('sync_jobs').update({ status: 'pending', started_at: null }).eq('status', 'in_progress').lt('started_at', stuckThreshold);
    await supabase.from('sync_jobs').update({ status: 'pending', error_message: null, retry_count: 0 }).eq('status', 'failed').lte('retry_count', 3);

    for (let i = 0; i < maxIterations; i++) {
      stats.iterations = i + 1;
      console.log(`Iteration ${i + 1}: Invoking dispatch-sync-jobs...`);
      
      const dispatchResponse = await fetch(`${supabaseUrl}/functions/v1/dispatch-sync-jobs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      const dispatchResult = dispatchResponse.ok ? await dispatchResponse.json() : null;
      if (!dispatchResponse.ok) {
        stats.errors.push({ iteration: i + 1, error: 'dispatch failed' });
        continue;
      }

      const dispatched = dispatchResult?.dispatched_jobs || 0;
      stats.total_dispatched += dispatched;
      stats.total_processed += dispatchResult?.attempted || 0;

      const { count: currentPending } = await supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      
      if (dispatched === 0 && (currentPending || 0) === 0) break;
      if (i < maxIterations - 1 && dispatched > 0) await new Promise(r => setTimeout(r, delayMs));
    }

    const { count: finalPending } = await supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    stats.end_time = new Date().toISOString();

    return new Response(JSON.stringify({
      message: "Force processing complete",
      summary: { ...stats, initial_pending: initialPending || 0, final_pending: finalPending || 0 }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
