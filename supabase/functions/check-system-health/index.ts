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

    const detectCompletionColumn = async (): Promise<string> => {
      // Different deployments used different columns over time.
      // Prefer an explicit completion timestamp when available.
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

    const completionCol = await detectCompletionColumn();

    const health: any = {
      timestamp: new Date().toISOString(),
      system_status: 'checking',
      issues: [],
      recommendations: [],
      details: {}
    };

    // 1. Check database state
    const { count: traderCount, error: traderError } = await supabase
      .from('traders')
      .select('*', { count: 'exact', head: true });

    const { count: pendingJobs, error: pendingError } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: completedJobs } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    const { data: recentCompleted, error: recentError } = await supabase
      .from('sync_jobs')
      .select(`${completionCol}, trader_id`)
      .eq('status', 'completed')
      .not(completionCol, 'is', null)
      .order(completionCol, { ascending: false, nullsFirst: false })
      .limit(1);

    const { data: oldestPending, error: oldestError } = await supabase
      .from('sync_jobs')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    health.details.database = {
      traders: traderCount || 0,
      pending_jobs: pendingJobs || 0,
      completed_jobs: completedJobs || 0,
      completion_column: completionCol,
      last_completed: (recentCompleted?.[0] as any)?.[completionCol] || null,
      oldest_pending: oldestPending?.[0]?.created_at || null,
      errors: {
        traders: traderError?.message,
        pending: pendingError?.message,
        recent: recentError?.message,
        oldest: oldestError?.message
      }
    };

    // 2. Check if system is processing
    if (recentCompleted && recentCompleted.length > 0) {
      const lastCompletedRaw = (recentCompleted[0] as any)?.[completionCol];
      const lastCompletedMs = lastCompletedRaw ? new Date(String(lastCompletedRaw)).getTime() : NaN;

      if (Number.isFinite(lastCompletedMs)) {
        const minutesSinceLastCompletion = (Date.now() - lastCompletedMs) / 1000 / 60;
        if (minutesSinceLastCompletion > 10) {
          health.issues.push({
            severity: 'high',
            issue: `No jobs completed in last ${Math.round(minutesSinceLastCompletion)} minutes`,
            possible_causes: [
              'sync-worker schedule not running',
              'dispatch-sync-jobs failing',
              'process-sync-job failing',
              'Upstream API errors'
            ]
          });
        }
      } else {
        health.issues.push({
          severity: 'medium',
          issue: `Cannot parse last completed timestamp from column '${completionCol}'`,
          note: 'Jobs may still be completing; verify via smoke script or sync_logs.'
        });
      }
    } else {
      health.issues.push({
        severity: 'critical',
        issue: 'No completed jobs found',
        possible_causes: [
          'System has never successfully processed a job',
          'All jobs are failing',
          'Scheduler not running'
        ]
      });
    }

    // 3. Check if discovery is working
    if ((traderCount || 0) < 500) {
      health.issues.push({
        severity: 'high',
        issue: `Only ${traderCount} traders in database (expected 1000+)`,
        possible_causes: [
          'discover-traders workflow not running',
          'sync-traders only fetching limited traders from Bullaware',
          'Bullaware API pagination stopping early',
          'Database constraint preventing inserts'
        ],
        actions: [
          'Check GitHub Actions: https://github.com/michaelwu1407-droid/market-compass-77/actions/workflows/discover-traders.yml',
          'Check Supabase logs for sync-traders function',
          'Manually trigger discover-traders workflow'
        ]
      });
    }

    // 4. Check queue health
    if ((pendingJobs || 0) > 5000) {
      health.issues.push({
        severity: 'medium',
        issue: `Very large queue: ${pendingJobs} pending jobs`,
        note: 'This might be normal if system is catching up, but check processing speed'
      });
    }

    if ((pendingJobs || 0) === 0 && (traderCount || 0) > 0) {
      health.issues.push({
        severity: 'low',
        issue: 'No pending jobs but traders exist',
        note: 'All traders may be up to date, or enqueue-sync-jobs not running'
      });
    }

    // 5. Check processing speed
    if (oldestPending && oldestPending.length > 0) {
      const oldestPendingTime = new Date(oldestPending[0].created_at);
      const hoursOld = (Date.now() - oldestPendingTime.getTime()) / 1000 / 60 / 60;
      
      if (hoursOld > 24) {
        health.issues.push({
          severity: 'high',
          issue: `Oldest pending job is ${Math.round(hoursOld)} hours old`,
          possible_causes: [
            'Jobs are stuck and not processing',
            'Processing is too slow',
            'Jobs are failing silently'
          ]
        });
      }

      // Calculate processing rate from recent completions (more meaningful than lifetime totals)
      const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { count: completedRecent } = await supabase
        .from('sync_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .not(completionCol, 'is', null)
        .gt(completionCol, sinceIso);

      const jobsPerHour = Math.round(((completedRecent || 0) / 30) * 60);
      
      health.details.processing_rate = {
        completed_last_30_min: completedRecent || 0,
        jobs_per_hour: jobsPerHour,
        estimated_time_to_clear: (pendingJobs || 0) > 0 && jobsPerHour > 0 ?
          `${Math.round((pendingJobs || 0) / jobsPerHour)} hours` : 'unknown'
      };
    }

    // 6. Generate recommendations
    if (health.issues.length === 0) {
      health.system_status = 'healthy';
      health.recommendations.push({
        message: 'System appears to be running normally',
        status: 'ok'
      });
    } else {
      health.system_status = 'issues_detected';
      const criticalIssues = health.issues.filter((i: any) => i.severity === 'critical');
      const highIssues = health.issues.filter((i: any) => i.severity === 'high');
      
      if (criticalIssues.length > 0) {
        health.recommendations.push({
          priority: 'critical',
          message: `${criticalIssues.length} critical issue(s) detected - immediate action required`
        });
      } else if (highIssues.length > 0) {
        health.recommendations.push({
          priority: 'high',
          message: `${highIssues.length} high-priority issue(s) detected`
        });
      }
    }

    return new Response(JSON.stringify(health, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      error: error?.message || error?.toString() || 'Unknown error',
      stack: error?.stack
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});

