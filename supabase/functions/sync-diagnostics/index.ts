/// <reference path="../edge-runtime.d.ts" />


// @ts-ignore: Deno runtime import (ignore in VS Code, works in Supabase Edge Functions)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore: Deno runtime import (ignore in VS Code, works in Supabase Edge Functions)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Unique build fingerprint for deployment verification
const BUILD_ID = "BUILD_2025_12_28_0209_SYD";
console.log("SYNC_DIAGNOSTICS_BUILD_ID", BUILD_ID);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced diagnostics function to help debug sync issues
// The following function is for Supabase Edge Functions (Deno runtime)
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Defensive guard for required env vars
  // @ts-ignore: Deno global for Edge Functions
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("MISSING_ENV", { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var",
        _debug_type: "missing_env",
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      }),
      { status: 500, headers: corsHeaders }
    );
  }
  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  const diagnostics: any = {
    debug: 'deployed-2025-12-28-0159-debug-test',
    build_id: BUILD_ID,
    timestamp: new Date().toISOString(),
    debug_marker: 'SYNC_DIAGNOSTICS_LIVE_2025-12-28-0159',
    traders: {},
    sync_jobs: {},
    worker_status: {},
    recommendations: [],
    domains: {}
  };

  // 2b. Per-domain health/cumulative metrics
  // Discussion Feed (use posts table)
  const { count: feedCount, error: feedCountError } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true });
  diagnostics.domains.discussion_feed = { total_posts: feedCount || 0 };
  if (feedCountError) diagnostics.domains.discussion_feed.error = feedCountError.message;

  // Latest post timestamp
  const { data: latestFeed } = await supabase
    .from('posts')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (latestFeed && latestFeed.length > 0) {
    diagnostics.domains.discussion_feed.latest_post = latestFeed[0].created_at;
    diagnostics.domains.discussion_feed.sync_lag_minutes = Math.round((Date.now() - new Date(latestFeed[0].created_at).getTime()) / 60000);
  }

  // New/updated/failed posts in last sync (from sync_datapoints)
  const { data: lastFeedRun } = await supabase
    .from('sync_runs')
    .select('id, finished_at')
    .eq('domain', 'discussion_feed')
    .order('finished_at', { ascending: false })
    .limit(1);
  if (lastFeedRun && lastFeedRun.length > 0) {
    const runId = lastFeedRun[0].id;
    const { data: feedDatapoints } = await supabase
      .from('sync_datapoints')
      .select('datapoint_key, value_current, status')
      .eq('run_id', runId);
    if (feedDatapoints) {
      diagnostics.domains.discussion_feed.last_sync = {
        datapoints: feedDatapoints,
        new_posts: feedDatapoints.find((d: any) => d.datapoint_key === 'new_posts')?.value_current || 0,
        updated_posts: feedDatapoints.find((d: any) => d.datapoint_key === 'updated_posts')?.value_current || 0,
        failed_posts: feedDatapoints.find((d: any) => d.datapoint_key === 'failed_posts')?.value_current || 0,
      };
    }
  }

  // Error/retry counts (from sync_datapoints)
  const { data: feedErrors } = await supabase
    .from('sync_datapoints')
    .select('status')
    .eq('domain', 'discussion_feed')
    .eq('status', 'error');
  diagnostics.domains.discussion_feed.error_count = feedErrors ? feedErrors.length : 0;

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

    // Processing rate + ETA (based on recent completions)
    const detectCompletionColumn = async (): Promise<string> => {
      const candidates = ['finished_at', 'completed_at', 'updated_at'] as const;
      for (const col of candidates) {
        const { data, error } = await supabase
          .from('sync_jobs')
          .select(col)
          .eq('status', 'completed')
          .not(col, 'is', null)
          .order(col, { ascending: false, nullsFirst: false })
          .limit(1);
        if (!error && (data?.[0] as any)?.[col] != null) return col;
      }
      return 'updated_at';
    };

    try {
      const completionCol = await detectCompletionColumn();
      const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { count: completedRecent } = await supabase
        .from('sync_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .not(completionCol, 'is', null)
        .gt(completionCol, sinceIso);

      const jobsPerHour = Math.round(((completedRecent || 0) / 30) * 60);
      const queueRemaining = (diagnostics.sync_jobs.pending || 0) + (diagnostics.sync_jobs.in_progress || 0);
      const etaSeconds = jobsPerHour > 0 ? Math.round((queueRemaining / jobsPerHour) * 3600) : null;

      diagnostics.sync_jobs.processing_rate = {
        completion_column: completionCol,
        completed_last_30_min: completedRecent || 0,
        jobs_per_hour: jobsPerHour,
      };
      diagnostics.sync_jobs.queue_remaining = queueRemaining;
      diagnostics.sync_jobs.eta_seconds = etaSeconds;
    } catch (e: any) {
      diagnostics.sync_jobs.processing_rate_error = e.message;
    }

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
});
