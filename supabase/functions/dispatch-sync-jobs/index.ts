import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CONCURRENT_INVOCATIONS = 10; // Adjust as needed

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 1. Find pending jobs
        const { data: pendingJobs, error: fetchError } = await supabase
            .from('sync_jobs')
            .select('id')
            .eq('status', 'pending')
            .limit(MAX_CONCURRENT_INVOCATIONS);

        if (fetchError) throw fetchError;

        if (!pendingJobs || pendingJobs.length === 0) {
            return new Response(JSON.stringify({ message: "No pending jobs to dispatch." }), { headers: corsHeaders });
        }

        // 2. Dispatch each job by invoking the processing function
        const invocationPromises = pendingJobs.map(job => {
            return supabase.functions.invoke('process-sync-job', {
                body: { job_id: job.id },
            });
        });

        const results = await Promise.all(invocationPromises);

        let invokedCount = 0;
        results.forEach((res, i) => {
            if (res.error) {
                console.error(`Failed to invoke process-sync-job for job ${pendingJobs[i].id}:`, res.error);
            } else {
                invokedCount++;
            }
        });

        console.log(`Dispatched ${invokedCount} of ${pendingJobs.length} pending jobs.`);

        return new Response(JSON.stringify({ 
            success: true, 
            dispatched_jobs: invokedCount 
        }), { headers: corsHeaders });

    } catch (error) {
        console.error("Dispatch error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});