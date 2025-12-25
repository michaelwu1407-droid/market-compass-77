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

    const results: any = {
      timestamp: new Date().toISOString(),
      functions: {},
      database: {},
      tests: {}
    };

    // 1. Check if sync_jobs table has required columns
    console.log("Checking sync_jobs table schema...");
    const { data: sampleJob, error: schemaError } = await supabase
      .from('sync_jobs')
      .select('*')
      .limit(1);

    if (schemaError) {
      results.database.sync_jobs_schema = { error: schemaError.message };
    } else {
      const requiredColumns = ['id', 'trader_id', 'status', 'started_at', 'finished_at', 'error_message', 'retry_count'];
      const actualColumns = sampleJob && sampleJob.length > 0 ? Object.keys(sampleJob[0]) : [];
      const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));
      
      results.database.sync_jobs_schema = {
        has_required_columns: missingColumns.length === 0,
        missing_columns: missingColumns,
        actual_columns: actualColumns
      };
    }

    // 2. Check sync_jobs status counts
    const { data: jobStats, error: jobError } = await supabase
      .from('sync_jobs')
      .select('status');

    if (!jobError && jobStats) {
      const counts = jobStats.reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});
      results.database.job_counts = counts;
      results.database.total_jobs = jobStats.length;
    }

    // 3. Check trader count
    const { count: traderCount, error: traderError } = await supabase
      .from('traders')
      .select('*', { count: 'exact', head: true });
    
    results.database.trader_count = traderCount || 0;
    if (traderError) {
      results.database.trader_count_error = traderError.message;
    }

    // 4. Test process-sync-job function (if there's a pending job)
    const { data: testJob } = await supabase
      .from('sync_jobs')
      .select('id')
      .eq('status', 'pending')
      .limit(1)
      .single();

    if (testJob) {
      console.log(`Testing process-sync-job with job ${testJob.id}...`);
      try {
        const { data: testResult, error: testError } = await supabase.functions.invoke('process-sync-job', {
          body: { job_id: testJob.id }
        });
        
        results.tests.process_sync_job = {
          tested: true,
          job_id: testJob.id,
          success: !testError,
          error: testError?.message || null,
          result: testResult
        };
      } catch (e: any) {
        results.tests.process_sync_job = {
          tested: true,
          job_id: testJob.id,
          success: false,
          error: e.message
        };
      }
    } else {
      results.tests.process_sync_job = {
        tested: false,
        reason: "No pending jobs available for testing"
      };
    }

    // 5. Test dispatch-sync-jobs function
    console.log("Testing dispatch-sync-jobs...");
    try {
      const { data: dispatchResult, error: dispatchError } = await supabase.functions.invoke('dispatch-sync-jobs');
      results.tests.dispatch_sync_jobs = {
        tested: true,
        success: !dispatchError,
        error: dispatchError?.message || null,
        result: dispatchResult
      };
    } catch (e: any) {
      results.tests.dispatch_sync_jobs = {
        tested: true,
        success: false,
        error: e.message
      };
    }

    // 6. Check sync-worker function
    console.log("Testing sync-worker...");
    try {
      const { data: workerResult, error: workerError } = await supabase.functions.invoke('sync-worker');
      results.tests.sync_worker = {
        tested: true,
        success: !workerError,
        error: workerError?.message || null,
        result: workerResult
      };
    } catch (e: any) {
      results.tests.sync_worker = {
        tested: true,
        success: false,
        error: e.message
      };
    }

    // 7. Check if sync-trader-details logs "Using mock details" (we can't directly check logs, but we can test the function)
    const { data: sampleTrader } = await supabase
      .from('traders')
      .select('etoro_username')
      .limit(1)
      .single();

    if (sampleTrader) {
      console.log(`Testing sync-trader-details with ${sampleTrader.etoro_username}...`);
      try {
        const { data: detailsResult, error: detailsError } = await supabase.functions.invoke('sync-trader-details', {
          body: { username: sampleTrader.etoro_username }
        });
        
        results.tests.sync_trader_details = {
          tested: true,
          username: sampleTrader.etoro_username,
          success: !detailsError,
          error: detailsError?.message || null,
          result: detailsResult,
          note: "Check Supabase logs for 'Using mock details' message to verify latest code is deployed"
        };
      } catch (e: any) {
        results.tests.sync_trader_details = {
          tested: true,
          success: false,
          error: e.message
        };
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
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

