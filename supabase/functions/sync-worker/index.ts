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
        // We can do this by checking if dispatchData.total_jobs (or pending count) is low
        // Or we can blindly try to enqueue if we want to ensure constant flow
        
        // For now, let's just log what happened
        return new Response(JSON.stringify({ 
            message: "Worker ran successfully", 
            dispatch_result: dispatchData 
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