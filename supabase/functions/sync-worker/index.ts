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
        // If no pending jobs were found, try to enqueue more
        const pendingCount = dispatchData?.dispatched_jobs === 0 && dispatchData?.attempted === 0;
        
        if (pendingCount) {
            console.log("No pending jobs found. Checking if we should enqueue more...");
            
            // Check current pending count
            const { count: currentPending } = await supabase
                .from('sync_jobs')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');
            
            // If we have less than 20 pending jobs, try to enqueue more
            if ((currentPending || 0) < 20) {
                console.log("Queue is low. Invoking enqueue-sync-jobs...");
                const { data: enqueueData, error: enqueueError } = await supabase.functions.invoke('enqueue-sync-jobs', {
                    body: { hours_stale: 6, hours_active: 7 * 24 }
                });
                
                if (enqueueError) {
                    console.error("Error enqueuing jobs:", enqueueError);
                } else {
                    console.log("Enqueued new jobs:", enqueueData);
                }
            }
        }
        
        return new Response(JSON.stringify({ 
            message: "Worker ran successfully", 
            dispatch_result: dispatchData,
            refilled_queue: pendingCount
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