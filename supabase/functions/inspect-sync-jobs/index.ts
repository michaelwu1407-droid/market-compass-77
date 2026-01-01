import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // IMPORTANT: PostgREST caps returned rows (commonly 1000). Use count=exact for totals.
    const [
      { count: pendingCount, error: pendingCountErr },
      { count: inProgressCount, error: inProgressCountErr },
      { count: completedCount, error: completedCountErr },
      { count: failedCount, error: failedCountErr },
    ] = await Promise.all([
      supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).in('status', ['in_progress', 'running']),
      supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    ]);

    const counts = {
      pending: pendingCount || 0,
      in_progress: inProgressCount || 0,
      completed: completedCount || 0,
      failed: failedCount || 0,
    };

    // Samples (bounded)
    const { data: recentJobs, error: recentErr } = await supabase
      .from('sync_jobs')
      .select('id, status, trader_id, job_type, created_at, started_at, finished_at, retry_count, error_message')
      .order('created_at', { ascending: false })
      .limit(25);

    const { data: pendingJobs, error: pendingError } = await supabase
      .from('sync_jobs')
      .select('id, status, trader_id, job_type, created_at, started_at, retry_count')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    const { data: failedSample, error: failedSampleErr } = await supabase
      .from('sync_jobs')
      .select('id, trader_id, job_type, created_at, finished_at, retry_count, error_message')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(25);

    // Top error messages (best-effort, limited scan)
    const topErrors: Array<{ error: string; count: number }> = [];
    if (failedSample && failedSample.length > 0) {
      const normalize = (s: any): string => {
        const t = String(s || '').trim();
        if (!t) return 'EMPTY';
        // normalize obvious noisy parts
        return t
          .replace(/\s+/g, ' ')
          .replace(/\bRay ID:\s*[a-z0-9]+\b/gi, 'Ray ID: <redacted>')
          .slice(0, 240);
      };

      const countsMap = new Map<string, number>();
      for (const r of failedSample) {
        const key = normalize((r as any).error_message);
        countsMap.set(key, (countsMap.get(key) || 0) + 1);
      }

      const sorted = Array.from(countsMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      for (const [error, count] of sorted) topErrors.push({ error, count });
    }

    return new Response(JSON.stringify({
      totals: {
        total_jobs: (counts.pending + counts.in_progress + counts.completed + counts.failed),
        status_counts: counts,
      },
      top_errors_sample_window: topErrors,
      pending_jobs_sample: pendingJobs || [],
      failed_jobs_sample: failedSample || [],
      recent_jobs_sample: recentJobs || [],
      errors: {
        counts: {
          pending: pendingCountErr?.message,
          in_progress: inProgressCountErr?.message,
          completed: completedCountErr?.message,
          failed: failedCountErr?.message,
        },
        recent: recentErr?.message,
        pending: pendingError?.message,
        failed_sample: failedSampleErr?.message,
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

