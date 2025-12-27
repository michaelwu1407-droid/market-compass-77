import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Domain = 'discussion_feed' | 'trader_profiles' | 'stock_data';

const LOCK_TTL_MINUTES = 5; // Stale lock threshold

type LockResult = {
  acquired: boolean;
  reason: 'success' | 'already_running' | 'stale_cleared' | 'row_initialized' | 'error';
  lockHolder?: string;
  lockAcquiredAt?: string;
  lockAgeMinutes?: number;
  message?: string;
};

type TriggerResult = {
  domain: Domain;
  status: 'started' | 'queued' | 'blocked' | 'error';
  message: string;
  run_id?: string;
  lock_info?: {
    holder: string;
    acquired_at: string;
    age_minutes: number;
    is_stale: boolean;
  };
};

async function acquireLock(supabase: any, domain: Domain, lockHolder: string): Promise<LockResult> {
  const staleCutoff = new Date(Date.now() - LOCK_TTL_MINUTES * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  
  console.log(`[acquireLock] Attempting to acquire lock for domain: ${domain}`);
  
  // Step 1: Check current state using maybeSingle (won't throw on 0 rows)
  const { data: current, error: fetchError } = await supabase
    .from('sync_domain_status')
    .select('status, lock_holder, lock_acquired_at')
    .eq('domain', domain)
    .maybeSingle();
  
  if (fetchError) {
    console.error(`[acquireLock] Error fetching status for ${domain}:`, fetchError);
    return { acquired: false, reason: 'error', message: fetchError.message };
  }
  
  // Step 2: If row doesn't exist, create it (defensive)
  if (!current) {
    console.log(`[acquireLock] No row found for ${domain}, creating one`);
    const { error: insertError } = await supabase
      .from('sync_domain_status')
      .insert({ 
        domain, 
        status: 'running', 
        lock_holder: lockHolder, 
        lock_acquired_at: now 
      });
    
    if (insertError) {
      console.error(`[acquireLock] Error creating row for ${domain}:`, insertError);
      return { acquired: false, reason: 'error', message: insertError.message };
    }
    
    console.log(`[acquireLock] Created new row and acquired lock for ${domain}`);
    return { acquired: true, reason: 'row_initialized' };
  }
  
  // Step 3: Calculate lock age if running
  const lockAcquiredAt = current.lock_acquired_at;
  const lockAgeMinutes = lockAcquiredAt 
    ? Math.floor((Date.now() - new Date(lockAcquiredAt).getTime()) / 60000)
    : 0;
  const isStale = lockAcquiredAt && lockAcquiredAt < staleCutoff;
  
  // Step 4: If running with fresh lock, reject with details
  if (current.status === 'running' && !isStale) {
    console.log(`[acquireLock] Domain ${domain} is running with fresh lock (${lockAgeMinutes} min old)`);
    return { 
      acquired: false, 
      reason: 'already_running',
      lockHolder: current.lock_holder,
      lockAcquiredAt,
      lockAgeMinutes,
      message: `Already running by ${current.lock_holder} (${lockAgeMinutes} min ago)`
    };
  }
  
  // Step 5: If stale lock, log warning and clear it
  if (current.status === 'running' && isStale) {
    console.log(`[acquireLock] Clearing stale lock for ${domain} (was held by ${current.lock_holder} for ${lockAgeMinutes} min)`);
    await supabase
      .from('sync_logs')
      .insert({
        domain,
        level: 'warn',
        message: `Stale lock auto-cleared (was held by ${current.lock_holder} for ${lockAgeMinutes} min, TTL is ${LOCK_TTL_MINUTES} min)`,
      });
  }
  
  // Step 6: Attempt to acquire lock (status is idle/error/completed OR stale)
  const { data: updated, error: updateError } = await supabase
    .from('sync_domain_status')
    .update({
      status: 'running',
      lock_holder: lockHolder,
      lock_acquired_at: now,
    })
    .eq('domain', domain)
    .select()
    .maybeSingle();
  
  if (updateError) {
    console.error(`[acquireLock] Error updating lock for ${domain}:`, updateError);
    return { acquired: false, reason: 'error', message: updateError.message };
  }
  
  if (!updated) {
    console.error(`[acquireLock] Update returned no data for ${domain}`);
    return { acquired: false, reason: 'error', message: 'Update returned no data' };
  }
  
  console.log(`[acquireLock] Successfully acquired lock for ${domain}${isStale ? ' (after clearing stale lock)' : ''}`);
  return { 
    acquired: true, 
    reason: isStale ? 'stale_cleared' : 'success' 
  };
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
  const { data: existing } = await supabase
    .from('sync_datapoints')
    .select('id')
    .eq('run_id', runId)
    .eq('datapoint_key', key)
    .maybeSingle();

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

// Helper function to call functions via HTTP (same project - native SUPABASE_URL)
async function invokeFunction(
  supabaseUrl: string, 
  supabaseKey: string, 
  functionName: string, 
  body: any = {}
): Promise<{ data: any; error: any }> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: { message: `HTTP ${response.status}: ${errorText}` } };
    }
    
    const data = await response.json();
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: { message: e.message || 'Unknown error' } };
  }
}

async function runDiscussionFeedSync(
  supabase: any, 
  runId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  const domain: Domain = 'discussion_feed';
  
  try {
    await updateProgress(supabase, domain, { 
      current_stage: 'Fetching eToro feed',
      items_completed: 0,
    });
    await upsertDatapoint(supabase, runId, domain, 'fetch_etoro', 'Fetch eToro Posts', 0, undefined, 'running');
    await logSync(supabase, runId, domain, 'info', 'Starting eToro feed fetch');

    // Call scrape-posts on same project
    const { data, error } = await invokeFunction(supabaseUrl, supabaseKey, 'scrape-posts');
    
    if (error) throw error;

    const postsScraped = data?.posts_scraped || 0;
    const postsProcessed = data?.posts_processed || 0;
    const postsInserted = data?.posts_inserted || 0;

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

async function runTraderProfilesSync(
  supabase: any, 
  runId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  const domain: Domain = 'trader_profiles';
  
  try {
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

    // Call dispatch-sync-jobs on same project
    const { data, error } = await invokeFunction(supabaseUrl, supabaseKey, 'dispatch-sync-jobs');
    
    if (error) throw error;

    const processed = data?.dispatched_jobs || 0;
    const errors = data?.errors || [];
    
    await upsertDatapoint(supabase, runId, domain, 'batch_processed', 'Batch Processed', processed, data?.attempted || processed, 'completed');
    
    if (errors.length > 0) {
      await upsertDatapoint(supabase, runId, domain, 'batch_errors', 'Batch Errors', errors.length, undefined, 'error', { errors });
    }

    await updateProgress(supabase, domain, {
      current_stage: 'Batch complete',
      items_completed: processed,
    });

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

async function runStockDataSync(
  supabase: any, 
  runId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  const domain: Domain = 'stock_data';
  
  try {
    await updateProgress(supabase, domain, {
      current_stage: 'Syncing assets from BullAware',
      items_completed: 0,
    });
    await upsertDatapoint(supabase, runId, domain, 'sync_bullaware', 'Sync from BullAware', 0, undefined, 'running');
    await logSync(supabase, runId, domain, 'info', 'Starting stock data sync');

    // Call sync-assets on same project
    const { data: assetsData, error: assetsError } = await invokeFunction(supabaseUrl, supabaseKey, 'sync-assets');
    
    if (assetsError) throw assetsError;

    const syncedCount = assetsData?.synced || 0;
    await upsertDatapoint(supabase, runId, domain, 'sync_bullaware', 'Sync from BullAware', syncedCount, syncedCount, 'completed');
    
    await updateProgress(supabase, domain, {
      current_stage: 'Enriching with Yahoo Finance',
      items_completed: syncedCount,
    });

    await logSync(supabase, runId, domain, 'info', `Synced ${syncedCount} assets`, assetsData);

    await upsertDatapoint(supabase, runId, domain, 'enrich_yahoo', 'Enrich with Yahoo', 0, undefined, 'running');
    
    // Call enrich-assets-yahoo on same project
    const { data: enrichData, error: enrichError } = await invokeFunction(supabaseUrl, supabaseKey, 'enrich-assets-yahoo');
    
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
    // Use native SUPABASE_URL - functions are deployed on this project
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    console.log(`[trigger-sync] SUPABASE_URL configured: ${!!supabaseUrl}`);
    console.log(`[trigger-sync] Using native Supabase project for both data and functions`);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const domains: Domain[] = body.domains || ['discussion_feed', 'trader_profiles', 'stock_data'];
    const triggeredBy = body.triggered_by || 'manual';
    const lockHolder = `trigger-${Date.now()}`;

    console.log(`trigger-sync called for domains: ${domains.join(', ')} by ${triggeredBy}`);
    
    const { data: debugStatus, error: debugError } = await supabase
      .from('sync_domain_status')
      .select('*')
      .limit(3);
    console.log(`[trigger-sync] Debug domain status read:`, { count: debugStatus?.length, error: debugError?.message });

    const results: TriggerResult[] = [];

    for (const domain of domains) {
      const lockResult = await acquireLock(supabase, domain, lockHolder);

      if (!lockResult.acquired) {
        // Return detailed lock info for UX
        const lockInfo = lockResult.lockHolder ? {
          holder: lockResult.lockHolder,
          acquired_at: lockResult.lockAcquiredAt || '',
          age_minutes: lockResult.lockAgeMinutes || 0,
          is_stale: (lockResult.lockAgeMinutes || 0) > LOCK_TTL_MINUTES,
        } : undefined;

        results.push({
          domain,
          status: lockResult.reason === 'already_running' ? 'blocked' : 'error',
          message: lockResult.message || 'Failed to acquire lock',
          lock_info: lockInfo,
        });
        continue;
      }

      try {
        const runId = await createRun(supabase, domain, triggeredBy);
        
        await supabase
          .from('sync_domain_status')
          .update({ current_run_id: runId })
          .eq('domain', domain);

        results.push({
          domain,
          status: 'started',
          message: 'Sync started',
          run_id: runId,
        });

        // Run sync in background - use native supabaseUrl and anonKey
        const syncPromise = (async () => {
          try {
            switch (domain) {
              case 'discussion_feed':
                await runDiscussionFeedSync(supabase, runId, supabaseUrl, supabaseAnonKey);
                break;
              case 'trader_profiles':
                await runTraderProfilesSync(supabase, runId, supabaseUrl, supabaseAnonKey);
                break;
              case 'stock_data':
                await runStockDataSync(supabase, runId, supabaseUrl, supabaseAnonKey);
                break;
            }
            await completeRun(supabase, runId, 'completed');
            await releaseLock(supabase, domain, 'idle');
          } catch (err: any) {
            console.error(`[trigger-sync] Error in ${domain} sync:`, err);
            await completeRun(supabase, runId, 'failed', err.message);
            await releaseLock(supabase, domain, 'error', err.message);
          }
        })();

        // Run sync in background (fire and forget)
        syncPromise.catch(err => console.error(`Background sync error for ${domain}:`, err));

      } catch (err: any) {
        console.error(`[trigger-sync] Error starting ${domain}:`, err);
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
      triggered_by: triggeredBy,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error('[trigger-sync] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
