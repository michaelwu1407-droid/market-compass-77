import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Domain = 'discussion_feed' | 'trader_profiles' | 'stock_data';
type TriggerResult = {
  domain: Domain;
  status: 'started' | 'queued' | 'blocked' | 'error';
  message: string;
  run_id?: string;
};

async function acquireLock(supabase: any, domain: Domain, lockHolder: string): Promise<boolean> {
  // Try to acquire lock - only if status is idle or error, or lock is stale (> 30 min)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('sync_domain_status')
    .update({
      status: 'running',
      lock_holder: lockHolder,
      lock_acquired_at: new Date().toISOString(),
    })
    .eq('domain', domain)
    .or(`status.eq.idle,status.eq.error,status.eq.completed,lock_acquired_at.lt.${thirtyMinutesAgo}`)
    .select()
    .single();

  return !!data && !error;
}

async function releaseLock(supabase: any, domain: Domain, status: string, errorMessage?: string): Promise<void> {
  const updates: Record<string, any> = {
    status,
    lock_holder: null,
    lock_acquired_at: null,
  };
  
  if (errorMessage) {
    updates.last_error_message = errorMessage;
    updates.last_error_at = new Date().toISOString();
  }
  
  if (status === 'idle') {
    updates.last_successful_at = new Date().toISOString();
  }

  await supabase
    .from('sync_domain_status')
    .update(updates)
    .eq('domain', domain);
}

async function updateProgress(supabase: any, domain: Domain, updates: Record<string, any>): Promise<void> {
  await supabase
    .from('sync_domain_status')
    .update(updates)
    .eq('domain', domain);
}

async function createRun(supabase: any, domain: Domain, triggeredBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('sync_runs')
    .insert({
      domain,
      status: 'running',
      started_at: new Date().toISOString(),
      triggered_by: triggeredBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

async function completeRun(supabase: any, runId: string, status: string, errorMessage?: string): Promise<void> {
  await supabase
    .from('sync_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', runId);
}

async function logSync(supabase: any, runId: string | null, domain: Domain, level: string, message: string, details?: any): Promise<void> {
  await supabase
    .from('sync_logs')
    .insert({
      run_id: runId,
      domain,
      level,
      message,
      details,
    });
}

async function checkBullAwareRateLimit(supabase: any): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

  // Get current rate limit state
  const { data } = await supabase
    .from('sync_rate_limits')
    .select('*')
    .eq('id', 'bullaware')
    .single();

  if (!data) {
    return { allowed: true, remaining: 10, resetAt: new Date(now.getTime() + 60000) };
  }

  const minuteStart = new Date(data.minute_started_at);
  
  // Reset counter if minute has passed
  if (minuteStart < oneMinuteAgo) {
    await supabase
      .from('sync_rate_limits')
      .update({
        requests_this_minute: 0,
        minute_started_at: now.toISOString(),
        next_reset_at: new Date(now.getTime() + 60000).toISOString(),
      })
      .eq('id', 'bullaware');
    
    return { allowed: true, remaining: 10, resetAt: new Date(now.getTime() + 60000) };
  }

  const remaining = data.max_per_minute - data.requests_this_minute;
  const resetAt = new Date(minuteStart.getTime() + 60000);
  
  return { 
    allowed: remaining > 0, 
    remaining: Math.max(0, remaining),
    resetAt 
  };
}

async function incrementBullAwareCounter(supabase: any): Promise<void> {
  await supabase.rpc('increment_rate_limit', { limit_id: 'bullaware' }).catch(() => {
    // Fallback if RPC doesn't exist
    supabase
      .from('sync_rate_limits')
      .update({ requests_this_minute: supabase.sql`requests_this_minute + 1` })
      .eq('id', 'bullaware');
  });
  
  // Direct update as fallback
  const { data } = await supabase
    .from('sync_rate_limits')
    .select('requests_this_minute')
    .eq('id', 'bullaware')
    .single();
  
  if (data) {
    await supabase
      .from('sync_rate_limits')
      .update({ requests_this_minute: (data.requests_this_minute || 0) + 1 })
      .eq('id', 'bullaware');
  }
}

async function runDiscussionFeedSync(supabase: any, runId: string): Promise<void> {
  const domain: Domain = 'discussion_feed';
  
  try {
    await updateProgress(supabase, domain, { 
      current_stage: 'Fetching eToro feed',
      items_completed: 0,
    });
    await logSync(supabase, runId, domain, 'info', 'Starting eToro feed fetch');

    // Invoke scrape-posts function
    const { data, error } = await supabase.functions.invoke('scrape-posts');
    
    if (error) throw error;

    await updateProgress(supabase, domain, {
      current_stage: 'Processing complete',
      items_completed: data?.posts_inserted || 0,
      items_total: data?.posts_scraped || 0,
    });
    
    await logSync(supabase, runId, domain, 'info', `Completed: ${data?.posts_inserted || 0} posts inserted`, data);

  } catch (err: any) {
    await logSync(supabase, runId, domain, 'error', err.message || 'Unknown error');
    throw err;
  }
}

async function runTraderProfilesSync(supabase: any, runId: string): Promise<void> {
  const domain: Domain = 'trader_profiles';
  
  try {
    // Check rate limit first
    const rateLimit = await checkBullAwareRateLimit(supabase);
    
    if (!rateLimit.allowed) {
      await updateProgress(supabase, domain, {
        status: 'rate_limited',
        current_stage: `Rate limited - resets at ${rateLimit.resetAt.toISOString()}`,
        eta_seconds: Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
      });
      await logSync(supabase, runId, domain, 'warn', 'Rate limited by BullAware API');
      return;
    }

    await updateProgress(supabase, domain, {
      current_stage: 'Processing sync queue',
      items_completed: 0,
    });

    // Get pending job count
    const { count: pendingCount } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    await updateProgress(supabase, domain, {
      items_total: pendingCount || 0,
    });

    await logSync(supabase, runId, domain, 'info', `Starting trader sync: ${pendingCount} jobs pending`);

    // Invoke dispatch-sync-jobs (processes batch respecting rate limits)
    await incrementBullAwareCounter(supabase);
    const { data, error } = await supabase.functions.invoke('dispatch-sync-jobs');
    
    if (error) throw error;

    const processed = data?.dispatched_jobs || 0;
    
    await updateProgress(supabase, domain, {
      current_stage: 'Batch complete',
      items_completed: processed,
    });

    // Update rate limit info
    const newRateLimit = await checkBullAwareRateLimit(supabase);
    await updateProgress(supabase, domain, {
      eta_seconds: newRateLimit.remaining > 0 ? null : Math.ceil((newRateLimit.resetAt.getTime() - Date.now()) / 1000),
    });

    await logSync(supabase, runId, domain, 'info', `Processed ${processed} trader jobs`, data);

  } catch (err: any) {
    await logSync(supabase, runId, domain, 'error', err.message || 'Unknown error');
    throw err;
  }
}

async function runStockDataSync(supabase: any, runId: string): Promise<void> {
  const domain: Domain = 'stock_data';
  
  try {
    await updateProgress(supabase, domain, {
      current_stage: 'Syncing assets from BullAware',
      items_completed: 0,
    });
    await logSync(supabase, runId, domain, 'info', 'Starting stock data sync');

    // Invoke sync-assets
    const { data: assetsData, error: assetsError } = await supabase.functions.invoke('sync-assets');
    
    if (assetsError) throw assetsError;

    await updateProgress(supabase, domain, {
      current_stage: 'Enriching with Yahoo Finance',
      items_completed: assetsData?.synced || 0,
    });

    await logSync(supabase, runId, domain, 'info', `Synced ${assetsData?.synced || 0} assets`, assetsData);

    // Invoke enrich-assets-yahoo
    const { data: enrichData, error: enrichError } = await supabase.functions.invoke('enrich-assets-yahoo');
    
    if (enrichError) {
      await logSync(supabase, runId, domain, 'warn', 'Yahoo enrichment failed', enrichError);
    } else {
      await logSync(supabase, runId, domain, 'info', `Enriched ${enrichData?.enriched || 0} assets`, enrichData);
    }

    await updateProgress(supabase, domain, {
      current_stage: 'Complete',
      items_completed: (assetsData?.synced || 0) + (enrichData?.enriched || 0),
      items_total: (assetsData?.synced || 0) + (enrichData?.remaining || 0) + (enrichData?.enriched || 0),
    });

  } catch (err: any) {
    await logSync(supabase, runId, domain, 'error', err.message || 'Unknown error');
    throw err;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const domains: Domain[] = body.domains || ['discussion_feed', 'trader_profiles', 'stock_data'];
    const triggeredBy = body.triggered_by || 'manual';
    const lockHolder = `trigger-${Date.now()}`;

    const results: TriggerResult[] = [];

    for (const domain of domains) {
      // Try to acquire lock
      const lockAcquired = await acquireLock(supabase, domain, lockHolder);

      if (!lockAcquired) {
        // Check if already running or queued
        const { data: status } = await supabase
          .from('sync_domain_status')
          .select('status, lock_holder')
          .eq('domain', domain)
          .single();

        results.push({
          domain,
          status: status?.status === 'running' ? 'blocked' : 'queued',
          message: status?.status === 'running' 
            ? `Sync already running (${status.lock_holder})` 
            : 'Another sync is queued',
        });
        continue;
      }

      try {
        // Create run record
        const runId = await createRun(supabase, domain, triggeredBy);

        await updateProgress(supabase, domain, {
          current_run_id: runId,
          status: 'running',
          items_completed: 0,
          items_total: 0,
          current_stage: 'Starting...',
          eta_seconds: null,
        });

        results.push({
          domain,
          status: 'started',
          message: 'Sync started',
          run_id: runId,
        });

        // Run the sync in background
        (async () => {
          try {
            switch (domain) {
              case 'discussion_feed':
                await runDiscussionFeedSync(supabase, runId);
                break;
              case 'trader_profiles':
                await runTraderProfilesSync(supabase, runId);
                break;
              case 'stock_data':
                await runStockDataSync(supabase, runId);
                break;
            }
            
            await completeRun(supabase, runId, 'completed');
            await releaseLock(supabase, domain, 'idle');
            
            await updateProgress(supabase, domain, {
              last_successful_run_id: runId,
              last_successful_at: new Date().toISOString(),
            });
          } catch (err: any) {
            await completeRun(supabase, runId, 'error', err.message);
            await releaseLock(supabase, domain, 'error', err.message);
          }
        })();

      } catch (err: any) {
        await releaseLock(supabase, domain, 'error', err.message);
        results.push({
          domain,
          status: 'error',
          message: err.message || 'Failed to start sync',
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('trigger-sync error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
