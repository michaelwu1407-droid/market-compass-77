import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CONCURRENT_INVOCATIONS = 10;

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

        const { data: pendingJobs, error: fetchError } = await supabase
            .from('sync_jobs')
            .select('id, status')
            .eq('status', 'pending')
            .limit(MAX_CONCURRENT_INVOCATIONS);

        if (fetchError) {
            console.error("Error fetching pending jobs:", fetchError);
            throw fetchError;
        }

        console.log(`Found ${pendingJobs?.length} pending jobs.`);

        if (!pendingJobs || pendingJobs.length === 0) {
            const { count } = await supabase.from('sync_jobs').select('*', { count: 'exact', head: true });
            return new Response(JSON.stringify({ message: "No pending jobs to dispatch.", total_jobs: count }), { headers: corsHeaders });
        }

        const invocationPromises = pendingJobs.map(job => {
            console.log(`Dispatching job ${job.id}`);
            return supabase.functions.invoke('process-sync-job', {
                body: { job_id: job.id },
            });
        });

        const results = await Promise.all(invocationPromises);

        let invokedCount = 0;
        const errors: any[] = []; // Collect errors

        results.forEach((res, i) => {
            if (res.error) {
                console.error(`Failed to invoke process-sync-job for job ${pendingJobs[i].id}:`, res.error);
                errors.push({ job_id: pendingJobs[i].id, error: res.error });
            } else {
                invokedCount++;
            }
        });

        console.log(`Dispatched ${invokedCount} of ${pendingJobs.length} pending jobs.`);

        return new Response(JSON.stringify({ 
            success: true, 
            dispatched_jobs: invokedCount,
            attempted: pendingJobs.length,
            errors: errors // Return errors in response
        }), { headers: corsHeaders });

    } catch (error) {
        console.error("Dispatch error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});