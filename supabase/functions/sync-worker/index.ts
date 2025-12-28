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
        const QUEUE_LOW_WATERMARK = 20;
        // Use native SUPABASE_URL - functions are deployed on this project
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Invoke dispatch-sync-jobs on same project
        console.log("Invoking dispatch-sync-jobs...");
        
        const dispatchResponse = await fetch(`${supabaseUrl}/functions/v1/dispatch-sync-jobs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        
        let dispatchData = null;
        let dispatchError = null;
        
        if (!dispatchResponse.ok) {
            dispatchError = `HTTP ${dispatchResponse.status}: ${await dispatchResponse.text()}`;
            console.error("Error invoking dispatch-sync-jobs:", dispatchError);
            return new Response(JSON.stringify({ 
                success: false,
                error: dispatchError,
                dispatch_result: null,
                pending_jobs: 0,
                trader_count: 0
            }), { 
                status: 200, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
        }
        
        dispatchData = await dispatchResponse.json();
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
        
        // If trader count is low, log it
        if ((traderCount || 0) < 5000) {
            console.log(`Trader count (${traderCount}) is below 5000. Queue will be refilled from existing traders.`);
        }
        
        // Enqueue only when the queue is genuinely low.
        if ((currentPending || 0) < QUEUE_LOW_WATERMARK) {
            console.log(`Queue is low (${currentPending} pending). Enqueuing more jobs...`);
            try {
                // Call enqueue-sync-jobs on same project
                const enqueueResponse = await fetch(`${supabaseUrl}/functions/v1/enqueue-sync-jobs`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${supabaseAnonKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({}),
                });
                
                if (!enqueueResponse.ok) {
                    const enqueueError = await enqueueResponse.text();
                    console.error("CRITICAL: Error enqueuing jobs:", enqueueError);
                } else {
                    const enqueueData = await enqueueResponse.json();
                    console.log("Enqueue result:", JSON.stringify(enqueueData, null, 2));
                    if (enqueueData && enqueueData.jobs_created === 0) {
                        console.error("CRITICAL: enqueue-sync-jobs returned 0 jobs created. This is a problem!");
                    }
                }
            } catch (e: any) {
                console.error("CRITICAL: Exception enqueuing jobs:", e.message);
            }
        } else {
            console.log(`Queue is healthy (${currentPending} pending jobs).`);
        }
        
        const shouldReschedule = (currentPending || 0) > 0 || (traderCount || 0) < 1000;
        
        if (shouldReschedule) {
            console.log("Work remaining - system should be called again in 2 minutes");
        }
        
        return new Response(JSON.stringify({ 
            message: "Worker ran successfully", 
            dispatch_result: dispatchData,
            pending_jobs: currentPending || 0,
            trader_count: traderCount || 0,
            actions_taken: {
                processed_jobs: dispatchData?.dispatched_jobs || 0,
                triggered_discovery: false,
                refilled_queue: (currentPending || 0) < QUEUE_LOW_WATERMARK
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
            status: 200,
        });
    }
});
