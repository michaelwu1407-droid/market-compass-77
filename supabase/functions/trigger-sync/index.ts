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
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  
  console.log(`[acquireLock] Attempting to acquire lock for domain: ${domain}`);
  
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

  console.log(`[acquireLock] Result for ${domain}:`, { data: !!data, error: error?.message || null });
  
  if (error) {
    console.error(`[acquireLock] Error acquiring lock for ${domain}:`, error);
  }
  
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

async function upsertDatapoint(
  supabase: any, 
  runId: string, 
  domain: Domain, 
  key: string, 
  label: string, 
  valueCurrent: number, 
  valueTotal: number | undefined = undefined,
  status: string = 'running',
  details?: any
): Promise<void> {
  // Try to update existing, if not found insert
  const { data: existing } = await supabase
    .from('sync_datapoints')
    .select('id')
    .eq('run_id', runId)
    .eq('datapoint_key', key)
    .single();

  if (existing) {
    await supabase
      .from('sync_datapoints')
      .update({ 
        value_current: valueCurrent, 
        value_total: valueTotal,
        status,
        details,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('sync_datapoints')
      .insert({
        run_id: runId,
        domain,
        datapoint_key: key,
        datapoint_label: label,
        value_current: valueCurrent,
        value_total: valueTotal,
        status,
        details,
      });
  }
}

async function checkBullAwareRateLimit(supabase: any): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

  const { data } = await supabase
    .from('sync_rate_limits')
    .select('*')
    .eq('id', 'bullaware')
    .single();

  if (!data) {
    return { allowed: true, remaining: 10, resetAt: new Date(now.getTime() + 60000) };
  }

  const minuteStart = new Date(data.minute_started_at);
  
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

async function runDiscussionFeedSync(supabase: any, runId: string): Promise<void> {
  const domain: Domain = 'discussion_feed';
  
  try {
    // Stage 1: Fetch eToro data
    await updateProgress(supabase, domain, { 
      current_stage: 'Fetching eToro feed',
      items_completed: 0,
    });
    await upsertDatapoint(supabase, runId, domain, 'fetch_etoro', 'Fetch eToro Posts', 0, undefined, 'running');
    await logSync(supabase, runId, domain, 'info', 'Starting eToro feed fetch');

    const { data, error } = await supabase.functions.invoke('scrape-posts');
    
    if (error) throw error;

    const postsScraped = data?.posts_scraped || 0;
    const postsProcessed = data?.posts_processed || 0;
    const postsInserted = data?.posts_inserted || 0;

    // Update datapoints
    await upsertDatapoint(supabase, runId, domain, 'fetch_etoro', 'Fetch eToro Posts', postsScraped, postsScraped, 'completed');
    await upsertDatapoint(supabase, runId, domain, 'parse_posts', 'Parse & Transform', postsProcessed, postsScraped, 'completed');
    await upsertDatapoint(supabase, runId, domain, 'write_db', 'Write to Database', postsInserted, postsProcessed, 'completed');
    await upsertDatapoint(supabase, runId, domain, 'deduped', 'Duplicates Skipped', postsProcessed - postsInserted, postsProcessed - postsInserted, 'completed');

    await updateProgress(supabase, domain, {
      current_stage: 'Complete',
      items_completed: postsInserted,
      items_total: postsScraped,
    });
    
    await logSync(supabase, runId, domain, 'info', `Completed: ${postsInserted} posts inserted`, data);

  } catch (err: any) {
    await upsertDatapoint(supabase, runId, domain, 'fetch_etoro', 'Fetch eToro Posts', 0, undefined, 'error', { error: err.message });
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
      await upsertDatapoint(supabase, runId, domain, 'rate_limit', 'Rate Limit Status', 0, rateLimit.remaining, 'rate_limited');
      await logSync(supabase, runId, domain, 'warn', 'Rate limited by BullAware API');
      return;
    }

    // Get queue stats
    const { count: pendingCount } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: inProgressCount } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_progress');

    const { count: completedCount } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    const { count: failedCount } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    // Update datapoints with queue status
    await upsertDatapoint(supabase, runId, domain, 'jobs_pending', 'Jobs Pending', pendingCount || 0, undefined, 'info');
    await upsertDatapoint(supabase, runId, domain, 'jobs_in_progress', 'Jobs In Progress', inProgressCount || 0, undefined, 'running');
    await upsertDatapoint(supabase, runId, domain, 'jobs_completed', 'Jobs Completed', completedCount || 0, undefined, 'completed');
    await upsertDatapoint(supabase, runId, domain, 'jobs_failed', 'Jobs Failed', failedCount || 0, undefined, failedCount > 0 ? 'error' : 'completed');
    await upsertDatapoint(supabase, runId, domain, 'rate_limit', 'API Requests (last min)', 10 - rateLimit.remaining, 10, 'info');

    await updateProgress(supabase, domain, {
      current_stage: 'Processing sync queue',
      items_total: pendingCount || 0,
      items_completed: 0,
    });

    await logSync(supabase, runId, domain, 'info', `Starting trader sync: ${pendingCount} jobs pending`);

    // Invoke dispatch-sync-jobs
    const { data, error } = await supabase.functions.invoke('dispatch-sync-jobs');
    
    if (error) throw error;

    const processed = data?.dispatched_jobs || 0;
    const errors = data?.errors || [];
    
    // Update datapoints after processing
    await upsertDatapoint(supabase, runId, domain, 'batch_processed', 'Batch Processed', processed, data?.attempted || processed, 'completed');
    
    if (errors.length > 0) {
      await upsertDatapoint(supabase, runId, domain, 'batch_errors', 'Batch Errors', errors.length, undefined, 'error', { errors });
    }

    await updateProgress(supabase, domain, {
      current_stage: 'Batch complete',
      items_completed: processed,
    });

    // Update rate limit info
    const newRateLimit = await checkBullAwareRateLimit(supabase);
    await upsertDatapoint(supabase, runId, domain, 'rate_limit', 'API Requests (last min)', 10 - newRateLimit.remaining, 10, 'info');
    
    await updateProgress(supabase, domain, {
      eta_seconds: newRateLimit.remaining > 0 ? null : Math.ceil((newRateLimit.resetAt.getTime() - Date.now()) / 1000),
    });

    await logSync(supabase, runId, domain, 'info', `Processed ${processed} trader jobs`, data);

  } catch (err: any) {
    await upsertDatapoint(supabase, runId, domain, 'dispatch', 'Dispatch Jobs', 0, undefined, 'error', { error: err.message });
    await logSync(supabase, runId, domain, 'error', err.message || 'Unknown error');
    throw err;
  }
}

async function runStockDataSync(supabase: any, runId: string): Promise<void> {
  const domain: Domain = 'stock_data';
  
  try {
    // Stage 1: Sync from BullAware
    await updateProgress(supabase, domain, {
      current_stage: 'Syncing assets from BullAware',
      items_completed: 0,
    });
    await upsertDatapoint(supabase, runId, domain, 'sync_bullaware', 'Sync from BullAware', 0, undefined, 'running');
    await logSync(supabase, runId, domain, 'info', 'Starting stock data sync');

    const { data: assetsData, error: assetsError } = await supabase.functions.invoke('sync-assets');
    
    if (assetsError) throw assetsError;

    const syncedCount = assetsData?.synced || 0;
    await upsertDatapoint(supabase, runId, domain, 'sync_bullaware', 'Sync from BullAware', syncedCount, syncedCount, 'completed');
    
    await updateProgress(supabase, domain, {
      current_stage: 'Enriching with Yahoo Finance',
      items_completed: syncedCount,
    });

    await logSync(supabase, runId, domain, 'info', `Synced ${syncedCount} assets`, assetsData);

    // Stage 2: Enrich with Yahoo Finance
    await upsertDatapoint(supabase, runId, domain, 'enrich_yahoo', 'Enrich with Yahoo', 0, undefined, 'running');
    
    const { data: enrichData, error: enrichError } = await supabase.functions.invoke('enrich-assets-yahoo');
    
    if (enrichError) {
      await upsertDatapoint(supabase, runId, domain, 'enrich_yahoo', 'Enrich with Yahoo', 0, undefined, 'error', { error: enrichError.message });
      await logSync(supabase, runId, domain, 'warn', 'Yahoo enrichment failed', enrichError);
    } else {
      const enrichedCount = enrichData?.enriched || 0;
      const remainingCount = enrichData?.remaining || 0;
      
      await upsertDatapoint(supabase, runId, domain, 'enrich_yahoo', 'Enrich with Yahoo', enrichedCount, enrichedCount + remainingCount, 'completed');
      await upsertDatapoint(supabase, runId, domain, 'yahoo_remaining', 'Yahoo Remaining', remainingCount, undefined, remainingCount > 0 ? 'pending' : 'completed');
      
      await logSync(supabase, runId, domain, 'info', `Enriched ${enrichedCount} assets`, enrichData);
    }

    // Get overall stats
    const { count: totalAssets } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true });

    const { count: stocksCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('asset_type', 'stock');

    const { count: cryptoCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('asset_type', 'crypto');

    const { count: etfCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('asset_type', 'etf');

    await upsertDatapoint(supabase, runId, domain, 'total_assets', 'Total Assets', totalAssets || 0, undefined, 'info');
    await upsertDatapoint(supabase, runId, domain, 'stocks', 'Stocks', stocksCount || 0, undefined, 'info');
    await upsertDatapoint(supabase, runId, domain, 'crypto', 'Crypto', cryptoCount || 0, undefined, 'info');
    await upsertDatapoint(supabase, runId, domain, 'etfs', 'ETFs', etfCount || 0, undefined, 'info');

    await updateProgress(supabase, domain, {
      current_stage: 'Complete',
      items_completed: syncedCount + (enrichData?.enriched || 0),
      items_total: totalAssets || 0,
    });

  } catch (err: any) {
    await upsertDatapoint(supabase, runId, domain, 'sync_bullaware', 'Sync from BullAware', 0, undefined, 'error', { error: err.message });
    await logSync(supabase, runId, domain, 'error', err.message || 'Unknown error');
    throw err;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use external Supabase project
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    
    console.log(`[trigger-sync] EXTERNAL_SUPABASE_URL configured: ${!!externalUrl}`);
    console.log(`[trigger-sync] EXTERNAL_SUPABASE_SERVICE_ROLE_KEY configured: ${!!externalKey}`);
    
    if (!externalUrl || !externalKey) {
      throw new Error('EXTERNAL_SUPABASE_URL or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    
    const supabase = createClient(externalUrl, externalKey);

    const body = await req.json().catch(() => ({}));
    const domains: Domain[] = body.domains || ['discussion_feed', 'trader_profiles', 'stock_data'];
    const triggeredBy = body.triggered_by || 'manual';
    const lockHolder = `trigger-${Date.now()}`;

    console.log(`trigger-sync called for domains: ${domains.join(', ')} by ${triggeredBy}`);
    
    // Debug: Check if we can read the domain status
    const { data: debugStatus, error: debugError } = await supabase
      .from('sync_domain_status')
      .select('*')
      .limit(3);
    console.log(`[trigger-sync] Debug domain status read:`, { count: debugStatus?.length, error: debugError?.message });

    const results: TriggerResult[] = [];

    for (const domain of domains) {
      // Try to acquire lock
      const lockAcquired = await acquireLock(supabase, domain, lockHolder);

      if (!lockAcquired) {
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

        // Run sync in background using EdgeRuntime.waitUntil
        const syncPromise = (async () => {
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
            
            console.log(`Sync completed successfully for ${domain}`);
          } catch (err: any) {
            console.error(`Sync failed for ${domain}:`, err);
            await completeRun(supabase, runId, 'error', err.message);
            await releaseLock(supabase, domain, 'error', err.message);
          }
        })();

        // Use EdgeRuntime.waitUntil if available for true background processing
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
          EdgeRuntime.waitUntil(syncPromise);
        } else {
          // Fallback: don't await, let it run
          syncPromise.catch(console.error);
        }

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

// Declare EdgeRuntime type for TypeScript
declare const EdgeRuntime: { waitUntil?: (promise: Promise<any>) => void } | undefined;
