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
             return new Response(JSON.stringify({ error: dispatchError }), { status: 500, headers: corsHeaders });
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
        
        // If trader count is low, discover new traders
        if ((traderCount || 0) < 1000) {
            console.log(`Trader count (${traderCount}) is below 1000. Triggering sync-traders to discover more...`);
            try {
                const { error: syncTradersError } = await supabase.functions.invoke('enqueue-sync-jobs', {
                    body: { sync_traders: true }
                });
                if (syncTradersError) {
                    console.error("Error triggering sync-traders:", syncTradersError);
                } else {
                    console.log("Triggered sync-traders to discover new traders");
                }
            } catch (e: any) {
                console.error("Exception triggering sync-traders:", e.message);
            }
        }
        
        // If we have less than 50 pending jobs, try to enqueue more from existing traders
        if ((currentPending || 0) < 50) {
            console.log(`Queue is low (${currentPending} pending). Enqueuing stale traders...`);
            try {
                const { data: enqueueData, error: enqueueError } = await supabase.functions.invoke('enqueue-sync-jobs', {
                    body: { hours_stale: 6, hours_active: 7 * 24 }
                });
                
                if (enqueueError) {
                    console.error("Error enqueuing jobs:", enqueueError);
                } else {
                    console.log("Enqueued new jobs:", enqueueData);
                }
            } catch (e: any) {
                console.error("Exception enqueuing jobs:", e.message);
            }
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

    } catch (error) {
        console.error("Worker error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});