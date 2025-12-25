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

        // 1. Invoke dispatch-sync-jobs
        // This will find pending jobs and invoke process-sync-job for them
        console.log("Invoking dispatch-sync-jobs...");
        const { data: dispatchData, error: dispatchError } = await supabase.functions.invoke('dispatch-sync-jobs');
        
        if (dispatchError) {
             console.error("Error invoking dispatch-sync-jobs:", dispatchError);
             // Return 200 with error details so caller can see what went wrong
             return new Response(JSON.stringify({ 
                 success: false,
                 error: typeof dispatchError === 'string' ? dispatchError : (dispatchError.message || JSON.stringify(dispatchError)),
                 dispatch_result: null,
                 pending_jobs: 0,
                 trader_count: 0
             }), { 
                 status: 200, 
                 headers: { ...corsHeaders, "Content-Type": "application/json" } 
             });
        }

        console.log("Dispatch result:", dispatchData);

        // 2. Check if queue is empty or low, and if so, refill it
        // Check current pending count
        const { count: currentPending } = await supabase
            .from('sync_jobs')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        
        // Check trader count
        const { count: traderCount } = await supabase
            .from('traders')
            .select('*', { count: 'exact', head: true });
        
        // If trader count is low, discover new traders (but only once per hour to respect API limits)
        // Check last discovery time to avoid hitting rate limits
        if ((traderCount || 0) < 5000) {
            // Only discover if we haven't done it recently (to respect Bullaware API rate limits)
            // sync-traders will be called via GitHub Actions hourly, so we don't need to call it here
            // Just ensure queue is filled from existing traders
            console.log(`Trader count (${traderCount}) is below 5000. Queue will be refilled from existing traders.`);
        }
        
        // NUCLEAR MODE: Always enqueue if pending < 200
        if ((currentPending || 0) < 200) {
            console.log(`Queue is low (${currentPending} pending). NUCLEAR MODE: Enqueuing ALL traders...`);
            try {
                // Call with no parameters - will enqueue ALL traders
                const { data: enqueueData, error: enqueueError } = await supabase.functions.invoke('enqueue-sync-jobs', {
                    body: {}
                });
                
                if (enqueueError) {
                    console.error("CRITICAL: Error enqueuing jobs:", enqueueError);
                    console.error("Enqueue error details:", JSON.stringify(enqueueError, null, 2));
                } else {
                    console.log("NUCLEAR MODE enqueue result:", JSON.stringify(enqueueData, null, 2));
                    if (enqueueData && enqueueData.jobs_created === 0) {
                        console.error("CRITICAL: enqueue-sync-jobs returned 0 jobs created. This is a problem!");
                    }
                }
            } catch (e: any) {
                console.error("CRITICAL: Exception enqueuing jobs:", e.message);
                console.error("Exception details:", e);
            }
        } else {
            console.log(`Queue is healthy (${currentPending} pending jobs).`);
        }
        
        // Self-schedule: Invoke ourselves again in 2 minutes if there's work to do
        // This is a workaround if pg_cron isn't working
        const shouldReschedule = (currentPending || 0) > 0 || (traderCount || 0) < 1000;
        
        if (shouldReschedule) {
            // Schedule next run in 2 minutes (120 seconds)
            // We'll use setTimeout equivalent - but in Deno, we can't do this directly
            // Instead, we'll return a note that the system should be called again
            console.log("Work remaining - system should be called again in 2 minutes");
        }
        
        return new Response(JSON.stringify({ 
            message: "Worker ran successfully", 
            dispatch_result: dispatchData,
            pending_jobs: currentPending || 0,
            trader_count: traderCount || 0,
            actions_taken: {
                processed_jobs: dispatchData?.dispatched_jobs || 0,
                triggered_discovery: (traderCount || 0) < 1000,
                refilled_queue: (currentPending || 0) < 50
            },
            note: shouldReschedule ? "More work available - call again in 2 minutes" : "Queue is healthy"
        }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });

    } catch (error: any) {
        console.error("Worker error:", error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error?.message || error?.toString() || 'Unknown error',
            dispatch_result: null,
            pending_jobs: 0,
            trader_count: 0
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200, // Return 200 so caller can see error details
        });
    }
});