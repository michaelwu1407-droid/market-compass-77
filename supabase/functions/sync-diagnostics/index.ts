import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced diagnostics function to help debug sync issues
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      traders: {},
      sync_jobs: {},
      worker_status: {},
      recommendations: []
    };

    // 1. Trader Statistics
    const { count: traderCount, error: traderError } = await supabase
      .from('traders')
      .select('*', { count: 'exact', head: true });

    diagnostics.traders.total_count = traderCount || 0;
    if (traderError) {
      diagnostics.traders.error = traderError.message;
    }

    // Get recently updated traders
    const { data: recentTraders } = await supabase
      .from('traders')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (recentTraders && recentTraders.length > 0) {
      diagnostics.traders.last_updated = recentTraders[0].updated_at;
    }

    // 2. Sync Jobs Statistics
    const { data: allJobs, error: jobsError } = await supabase
      .from('sync_jobs')
      .select('status, created_at, finished_at, error_message');

    if (!jobsError && allJobs) {
      const statusCounts = allJobs.reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});

      diagnostics.sync_jobs = {
        total: allJobs.length,
        by_status: statusCounts,
        pending: statusCounts.pending || 0,
        in_progress: statusCounts.in_progress || 0,
        completed: statusCounts.completed || 0,
        failed: statusCounts.failed || 0
      };

      // Get recent errors
      const recentErrors = allJobs
        .filter((j: any) => j.status === 'failed' && j.error_message)
        .slice(0, 5)
        .map((j: any) => ({
          error: j.error_message,
          created_at: j.created_at
        }));

      if (recentErrors.length > 0) {
        diagnostics.sync_jobs.recent_errors = recentErrors;
      }

      // Get oldest pending job
      const pendingJobs = allJobs.filter((j: any) => j.status === 'pending');
      if (pendingJobs.length > 0) {
        const oldestPending = pendingJobs.sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0];
        diagnostics.sync_jobs.oldest_pending = oldestPending.created_at;
      }
    } else if (jobsError) {
      diagnostics.sync_jobs.error = jobsError.message;
    }

    // 3. Worker Status (check pg_cron if possible)
    try {
      // Try to check if sync-worker was recently invoked
      // We can't directly query pg_cron, but we can check if jobs are being processed
      const { data: recentCompleted } = await supabase
        .from('sync_jobs')
        .select('finished_at')
        .eq('status', 'completed')
        .order('finished_at', { ascending: false })
        .limit(1);

      if (recentCompleted && recentCompleted.length > 0) {
        const lastCompleted = new Date(recentCompleted[0].finished_at);
        const minutesAgo = (Date.now() - lastCompleted.getTime()) / 1000 / 60;
        diagnostics.worker_status = {
          last_job_completed: recentCompleted[0].finished_at,
          minutes_ago: Math.round(minutesAgo),
          appears_active: minutesAgo < 10 // If job completed in last 10 minutes, worker seems active
        };
      } else {
        diagnostics.worker_status = {
          appears_active: false,
          reason: "No completed jobs found"
        };
      }
    } catch (e: any) {
      diagnostics.worker_status.error = e.message;
    }

    // 4. Generate Recommendations
    if (diagnostics.sync_jobs.pending > 50) {
      diagnostics.recommendations.push({
        severity: "high",
        message: `There are ${diagnostics.sync_jobs.pending} pending jobs. Consider running force-process-queue to clear the backlog.`
      });
    }

    if (diagnostics.sync_jobs.failed > 10) {
      diagnostics.recommendations.push({
        severity: "medium",
        message: `There are ${diagnostics.sync_jobs.failed} failed jobs. Check error messages and consider resetting failed jobs.`
      });
    }

    if (diagnostics.worker_status.appears_active === false) {
      diagnostics.recommendations.push({
        severity: "high",
        message: "Sync worker does not appear to be running. GitHub Actions should be calling sync-worker every 2 minutes. Check: https://github.com/michaelwu1407-droid/market-compass-77/actions"
      });
    }

    if (diagnostics.traders.total_count < 150 && diagnostics.sync_jobs.pending === 0) {
      diagnostics.recommendations.push({
        severity: "low",
        message: "Trader count is low. Consider running sync-traders to discover more traders."
      });
    }

    return new Response(JSON.stringify(diagnostics, null, 2), {
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

