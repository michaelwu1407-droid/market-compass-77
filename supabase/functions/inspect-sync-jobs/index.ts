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

    // Get all jobs with details
    const { data: allJobs, error: allError } = await supabase
      .from('sync_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    // Get pending jobs specifically
    const { data: pendingJobs, error: pendingError } = await supabase
      .from('sync_jobs')
      .select('id, status, trader_id, created_at, started_at')
      .eq('status', 'pending')
      .limit(10);

    // Get status counts
    const { data: statusCounts, error: statusError } = await supabase
      .from('sync_jobs')
      .select('status');

    const counts = statusCounts?.reduce((acc: any, job: any) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {}) || {};

    return new Response(JSON.stringify({
      total_jobs: allJobs?.length || 0,
      status_counts: counts,
      pending_jobs_sample: pendingJobs || [],
      all_jobs_sample: allJobs?.slice(0, 5) || [],
      errors: {
        all: allError?.message,
        pending: pendingError?.message,
        status: statusError?.message
      }
    }, null, 2), {
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

