import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_ITERATIONS = 100; // Safety limit to prevent infinite loops
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const maxIterations = body.max_iterations || MAX_ITERATIONS;
    const delayMs = body.delay_ms || DELAY_BETWEEN_BATCHES;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const stats = {
      iterations: 0,
      total_dispatched: 0,
      total_processed: 0,
      errors: [] as any[],
      start_time: new Date().toISOString(),
      end_time: null as string | null
    };

    console.log("Starting force-process-queue...");

    // Get initial counts for all statuses
    const { count: initialPending } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    const { count: initialInProgress } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_progress');
    
    const { count: initialFailed } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    console.log(`Found ${initialPending} pending, ${initialInProgress} in_progress, ${initialFailed} failed jobs initially.`);
    
    // Reset stuck in_progress jobs (older than 10 minutes) back to pending
    const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: resetCount } = await supabase
      .from('sync_jobs')
      .update({ status: 'pending', started_at: null })
      .eq('status', 'in_progress')
      .lt('started_at', stuckThreshold);
    
    if (resetCount && resetCount > 0) {
      console.log(`Reset ${resetCount} stuck in_progress jobs back to pending`);
    }
    
    // Also reset failed jobs with low retry count
    const { count: retryCount } = await supabase
      .from('sync_jobs')
      .update({ status: 'pending', error_message: null, retry_count: 0 })
      .eq('status', 'failed')
      .lte('retry_count', 3);
    
    if (retryCount && retryCount > 0) {
      console.log(`Reset ${retryCount} failed jobs back to pending for retry`);
    }

    // Process in batches until no more pending jobs
    for (let i = 0; i < maxIterations; i++) {
      stats.iterations = i + 1;

      // Invoke dispatch-sync-jobs
      console.log(`Iteration ${i + 1}: Invoking dispatch-sync-jobs...`);
      const { data: dispatchResult, error: dispatchError } = await supabase.functions.invoke('dispatch-sync-jobs');

      if (dispatchError) {
        console.error(`Error in iteration ${i + 1}:`, dispatchError);
        stats.errors.push({
          iteration: i + 1,
          error: dispatchError.message || dispatchError
        });
        break; // Stop on error
      }

      const dispatched = dispatchResult?.dispatched_jobs || 0;
      const attempted = dispatchResult?.attempted || 0;
      const errors = dispatchResult?.errors || [];
      const dispatchError = dispatchResult?.error;

      stats.total_dispatched += dispatched;
      stats.total_processed += attempted;
      
      if (errors.length > 0) {
        stats.errors.push(...errors);
        console.error(`Iteration ${i + 1} errors:`, errors);
      }
      
      if (dispatchError) {
        stats.errors.push({ iteration: i + 1, error: dispatchError });
        console.error(`Iteration ${i + 1} dispatch error:`, dispatchError);
      }

      console.log(`Iteration ${i + 1}: Dispatched ${dispatched} jobs (attempted ${attempted})${errors.length > 0 ? `, ${errors.length} errors` : ''}${dispatchError ? `, dispatch error: ${dispatchError}` : ''}`);
      
      // Debug: Check why no jobs were dispatched
      if (dispatched === 0 && attempted === 0) {
        const { count: debugPending } = await supabase
          .from('sync_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        console.log(`[DEBUG] Iteration ${i + 1}: Found ${debugPending} pending jobs but dispatch returned 0. Dispatch result:`, JSON.stringify(dispatchResult));
      }

      // Check if there are still pending jobs
      const { count: currentPending } = await supabase
        .from('sync_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      // If no jobs were dispatched AND no pending jobs remain, we're done
      if ((dispatched === 0 || attempted === 0) && (currentPending || 0) === 0) {
        console.log("No more pending jobs to process.");
        break;
      }
      
      // If we got errors but still have pending jobs, continue trying
      if (dispatched === 0 && (currentPending || 0) > 0) {
        console.log(`Still have ${currentPending} pending jobs but dispatch returned 0. Continuing...`);
        // Don't break - keep trying
      }

      // Wait before next batch (except on last iteration)
      if (i < maxIterations - 1 && dispatched > 0) {
        console.log(`Waiting ${delayMs}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Get final pending count
    const { count: finalPending } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    stats.end_time = new Date().toISOString();

    const summary = {
      ...stats,
      initial_pending: initialPending || 0,
      final_pending: finalPending || 0,
      jobs_cleared: (initialPending || 0) - (finalPending || 0),
      success: stats.errors.length === 0
    };

    console.log("Force processing complete:", summary);

    return new Response(JSON.stringify({
      message: "Force processing complete",
      summary
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});

