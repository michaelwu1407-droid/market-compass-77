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
      tests: {}
    };

    // Test 1: Check if we can query traders
    console.log("Test 1: Querying traders...");
    const { data: traders, error: tradersError, count: traderCount } = await supabase
      .from('traders')
      .select('id, etoro_username, updated_at', { count: 'exact' })
      .limit(5);
    
    results.tests.query_traders = {
      success: !tradersError,
      error: tradersError?.message || null,
      count: traderCount || 0,
      sample: traders?.slice(0, 3) || []
    };

    // Test 2: Check if we can query stale traders
    console.log("Test 2: Querying stale traders...");
    const staleThreshold = new Date(Date.now() - 6 * 3600000).toISOString();
    const { data: staleTraders, error: staleError, count: staleCount } = await supabase
      .from('traders')
      .select('id', { count: 'exact' })
      .or(`updated_at.lt.${staleThreshold},updated_at.is.null`)
      .limit(10);
    
    results.tests.query_stale_traders = {
      success: !staleError,
      error: staleError?.message || null,
      count: staleCount || 0,
      sample_ids: staleTraders?.slice(0, 5).map(t => t.id) || []
    };

    // Test 3: Check if we can insert into sync_jobs
    console.log("Test 3: Testing insert into sync_jobs...");
    if (staleTraders && staleTraders.length > 0) {
      const testJob = {
        trader_id: staleTraders[0].id,
        status: 'pending',
        job_type: 'deep_sync'
      };
      
      const { data: insertedJob, error: insertError } = await supabase
        .from('sync_jobs')
        .insert(testJob)
        .select('id')
        .single();
      
      results.tests.insert_sync_job = {
        success: !insertError,
        error: insertError?.message || null,
        error_details: insertError ? JSON.stringify(insertError) : null,
        inserted_id: insertedJob?.id || null
      };

      // Clean up test job
      if (insertedJob?.id) {
        await supabase.from('sync_jobs').delete().eq('id', insertedJob.id);
      }
    } else {
      results.tests.insert_sync_job = {
        success: false,
        error: "No stale traders found to test with"
      };
    }

    // Test 4: Check current sync_jobs status
    console.log("Test 4: Checking sync_jobs status...");
    const { data: allJobs, error: jobsError, count: jobsCount } = await supabase
      .from('sync_jobs')
      .select('status, created_at', { count: 'exact' })
      .limit(100);
    
    if (!jobsError && allJobs) {
      const statusCounts = allJobs.reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});
      
      results.tests.sync_jobs_status = {
        success: true,
        total: jobsCount || 0,
        by_status: statusCounts,
        pending: statusCounts.pending || 0,
        in_progress: statusCounts.in_progress || 0,
        completed: statusCounts.completed || 0,
        failed: statusCounts.failed || 0
      };
    } else {
      results.tests.sync_jobs_status = {
        success: false,
        error: jobsError?.message || 'Unknown error'
      };
    }

    // Test 5: Try to invoke enqueue-sync-jobs
    console.log("Test 5: Testing enqueue-sync-jobs function...");
    try {
      const { data: enqueueResult, error: enqueueError } = await supabase.functions.invoke('enqueue-sync-jobs', {
        body: { hours_stale: 6, hours_active: 7 * 24 }
      });
      
      results.tests.invoke_enqueue = {
        success: !enqueueError,
        error: enqueueError?.message || null,
        result: enqueueResult
      };
    } catch (e: any) {
      results.tests.invoke_enqueue = {
        success: false,
        error: e.message || e.toString()
      };
    }

    // Summary
    const allTestsPassed = Object.values(results.tests).every((test: any) => test.success === true);
    results.summary = {
      all_tests_passed: allTestsPassed,
      total_tests: Object.keys(results.tests).length,
      passed_tests: Object.values(results.tests).filter((test: any) => test.success === true).length
    };

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

