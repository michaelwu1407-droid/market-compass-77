import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process jobs sequentially to respect Bullaware API rate limit (10 req/min)
// We'll process 1 job every 7 seconds = ~8.5 req/min (safe margin)
const MAX_JOBS_TO_PROCESS = 10;
const DELAY_BETWEEN_JOBS_MS = 7000; // 7 seconds = ~8.5 req/min

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        console.log("Searching for pending jobs...");

        // Also reset stuck in_progress jobs (older than 10 minutes) before fetching
        const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { error: resetError } = await supabase
            .from('sync_jobs')
            .update({ status: 'pending', started_at: null })
            .eq('status', 'in_progress')
            .lt('started_at', stuckThreshold);
        
        if (resetError) {
            console.warn("Warning: Error resetting stuck jobs (non-fatal):", resetError);
        }

        const { data: pendingJobs, error: fetchError } = await supabase
            .from('sync_jobs')
            .select('id, status')
            .eq('status', 'pending')
            .order('created_at', { ascending: true }) // Process oldest first
            .limit(MAX_JOBS_TO_PROCESS); // Process up to 10 jobs per call (with 7s delays = ~1.4 min per batch)

        if (fetchError) {
            console.error("Error fetching pending jobs:", fetchError);
            throw fetchError;
        }

        console.log(`Found ${pendingJobs?.length} pending jobs.`);

        if (!pendingJobs || pendingJobs.length === 0) {
            // Double-check with a count query
            const { count, error: countError } = await supabase
                .from('sync_jobs')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');
            
            console.log(`[DEBUG] Count query: ${count} pending jobs, error:`, countError);
            
            if (count && count > 0) {
                // There are pending jobs but select returned none - might be a query issue
                console.error(`[DEBUG] Mismatch: Count shows ${count} pending but select returned 0. Checking query...`);
                // Try without limit
                const { data: allPending, error: allPendingError } = await supabase
                    .from('sync_jobs')
                    .select('id, status, created_at')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: true });
                console.log(`[DEBUG] All pending jobs query:`, allPending?.length, 'error:', allPendingError);
            }
            
        return new Response(JSON.stringify({ 
            message: "No pending jobs to dispatch.", 
            total_jobs: count,
            dispatched_jobs: 0,
            attempted: 0,
            errors: [],
            debug: { count, countError }
        }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });
        }

        // Process jobs sequentially to respect Bullaware API rate limit (10 req/min)
        let invokedCount = 0;
        const errors: any[] = []; // Collect errors

        for (let i = 0; i < pendingJobs.length; i++) {
            const job = pendingJobs[i];
            console.log(`Processing job ${i + 1}/${pendingJobs.length}: ${job.id}`);
            
            try {
                const { data: result, error: invokeError } = await supabase.functions.invoke('process-sync-job', {
                    body: { job_id: job.id },
                });
                
                if (invokeError) {
                    // Supabase function invocation error (network, auth, etc.)
                    const errorMsg = typeof invokeError === 'string' ? invokeError : (invokeError.message || JSON.stringify(invokeError));
                    console.error(`Failed to invoke process-sync-job for job ${job.id}:`, errorMsg);
                    errors.push({ job_id: job.id, error: `Invocation error: ${errorMsg}` });
                } else if (result && result.error) {
                    // Function returned successfully but with an error in the response
                    console.error(`process-sync-job returned error for job ${job.id}:`, result.error);
                    errors.push({ job_id: job.id, error: result.error });
                } else {
                    // Success
                    invokedCount++;
                    console.log(`Successfully processed job ${job.id}`);
                }
                
                // Add delay between jobs to respect rate limit (except for last job)
                if (i < pendingJobs.length - 1) {
                    console.log(`Waiting ${DELAY_BETWEEN_JOBS_MS}ms before next job to respect API rate limit...`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOBS_MS));
                }
            } catch (err: any) {
                // Catch any unexpected errors
                const errorMsg = err?.message || err?.toString() || JSON.stringify(err);
                console.error(`Exception invoking process-sync-job for job ${job.id}:`, errorMsg);
                errors.push({ job_id: job.id, error: `Exception: ${errorMsg}` });
                
                // Still add delay even on error to respect rate limits
                if (i < pendingJobs.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOBS_MS));
                }
            }
        }

        console.log(`Dispatched ${invokedCount} of ${pendingJobs.length} pending jobs.`);

        return new Response(JSON.stringify({ 
            success: true, 
            dispatched_jobs: invokedCount,
            attempted: pendingJobs.length,
            errors: errors // Return errors in response
        }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });

    } catch (error: any) {
        console.error("Dispatch error:", error);
        // Always return 200 with error details instead of 500, so force-process-queue can continue
        return new Response(JSON.stringify({ 
            success: false,
            error: error?.message || error?.toString() || 'Unknown error',
            dispatched_jobs: 0,
            attempted: 0,
            errors: [{ error: error?.message || error?.toString() || 'Unknown error' }]
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200, // Return 200 so caller can see the error details
        });
    }
});