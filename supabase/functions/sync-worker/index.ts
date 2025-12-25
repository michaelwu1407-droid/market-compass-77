import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Bullaware API Configuration
const BULLAWARE_BASE = 'https://api.bullaware.com/v1';
const ENDPOINTS = {
  investors: `${BULLAWARE_BASE}/investors`,
  investorDetails: (username: string) => `${BULLAWARE_BASE}/investors/${username}`,
  metrics: (username: string) => `${BULLAWARE_BASE}/investors/${username}/metrics`,
  riskScore: (username: string) => `${BULLAWARE_BASE}/investors/${username}/risk-score/monthly`,
  instruments: `${BULLAWARE_BASE}/instruments`,
};

// Syncing Strategy Configuration
const BATCH_SIZE_DISCOVERY = 50;
const BATCH_SIZE_PROCESSING = 1;
const RATE_LIMIT_DELAY_MS = 6000;
const STALE_THRESHOLD_HOURS = {
    DISCOVERY: 6,
    DETAILS: 2,
    ASSETS: 24,
};

// --- Type Definitions ---
interface SyncState {
  id: string;
  last_run: string | null;
  status: string;
  last_page: number;
}
interface Trader {
  id: string;
  etoro_username: string;
}

// --- Utility Functions ---
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const isStale = (lastRun: string | null, hours: number): boolean => {
  if (!lastRun) return true;
  const hoursDiff = (new Date().getTime() - new Date(lastRun).getTime()) / (1000 * 60 * 60);
  return hoursDiff >= hours;
};

// Helper function to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 30000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// --- Core API Logic ---

/**
 * Fetches all the detailed data for a single trader from Bullaware and updates the database.
 * This version includes ROBUST ERROR HANDLING for each API call.
 */
async function syncCompleteTraderDetails(supabase: SupabaseClient, apiKey: string, trader: Trader) {
  const { id, etoro_username } = trader;
  console.log(`[sync-worker] Starting full detail sync for ${etoro_username}`);

  try {
    // 1. Fetch Investor Details
    try {
      const detailsRes = await fetchWithTimeout(ENDPOINTS.investorDetails(etoro_username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        const investor = detailsData.investor || detailsData.data || detailsData;
        await supabase.from('traders').update({
           profitable_weeks_pct: investor.profitableWeeksPct,
           profitable_months_pct: investor.profitableMonthsPct,
           daily_drawdown: investor.dailyDD,
           weekly_drawdown: investor.weeklyDD,
        }).eq('id', id);
      } else {
        console.warn(`[sync-worker] Details API for ${etoro_username} returned ${detailsRes.status}`);
      }
    } catch (e) {
      console.warn(`[sync-worker] Error fetching details for ${etoro_username}:`, e);
      // Continue to next steps, don't abort yet unless it's critical
    }

    await delay(RATE_LIMIT_DELAY_MS);

    // 2. Fetch Risk Score
    try {
      const riskRes = await fetchWithTimeout(ENDPOINTS.riskScore(etoro_username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (riskRes.ok) {
        const riskData = await riskRes.json();
        const score = typeof riskData === 'number' ? riskData : (riskData.riskScore || riskData.points?.[riskData.points.length - 1]?.riskScore);
        if (score) await supabase.from('traders').update({ risk_score: score }).eq('id', id);
      }
    } catch (e) {
      console.warn(`[sync-worker] Error fetching risk for ${etoro_username}:`, e);
    }

    await delay(RATE_LIMIT_DELAY_MS);

    // 3. Fetch Metrics
    try {
      const metricsRes = await fetchWithTimeout(ENDPOINTS.metrics(etoro_username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        const m = metricsData.data || metricsData;
        await supabase.from('traders').update({
           sharpe_ratio: m.sharpeRatio,
           sortino_ratio: m.sortinoRatio,
           alpha: m.alpha,
           beta: m.beta,
        }).eq('id', id);
      }
    } catch (e) {
      console.warn(`[sync-worker] Error fetching metrics for ${etoro_username}:`, e);
    }

    // 4. Finalize: Mark as synced
    // If we reached here without fatal error (individual steps might have failed but caught), we consider it synced.
    // If ALL steps failed, it might be a broken trader, but we still mark as synced to prevent infinite loops,
    // unless we want to track 'last_sync_error'.

    await supabase.from('traders').update({
      details_synced_at: new Date().toISOString(),
      last_sync_error: null
    }).eq('id', id);

    console.log(`[sync-worker] Finished full detail sync for ${etoro_username}`);

  } catch (error) {
    console.error(`[sync-worker] Fatal error syncing details for ${etoro_username}:`, error);

    // CRITICAL FIX: Ensure we move on even if there's a fatal error
    try {
        // Attempt 1: Update error message and timestamp
        await supabase.from('traders').update({
            last_sync_error: error instanceof Error ? error.message : 'Unknown error',
            details_synced_at: new Date().toISOString()
        }).eq('id', id);
    } catch (dbError) {
        // Attempt 2: Fallback if 'last_sync_error' column is missing or other DB constraint
        console.error(`[sync-worker] Failed to update error status for ${etoro_username}. Trying fallback update.`, dbError);
        try {
            await supabase.from('traders').update({
                details_synced_at: new Date().toISOString()
            }).eq('id', id);
        } catch (finalError) {
             console.error(`[sync-worker] CRITICAL: Could not update timestamp for ${etoro_username}. Trader will remain stale.`, finalError);
        }
    }

    // We do NOT re-throw here to ensure the worker response is valid JSON (action: details_sync, status: error)
    // allowing the system to log it but not crash the HTTP invocation if possible.
    // However, the caller expects a return.
  }
}

async function discoverTraders(supabase: SupabaseClient, apiKey: string, state: SyncState | undefined) {
    const currentPage = state?.status === 'paginating' ? state.last_page : 1;
    console.log(`[sync-worker] Running discovery: page ${currentPage}`);

    // Add timeout to discovery
    const response = await fetchWithTimeout(`${ENDPOINTS.investors}?page=${currentPage}&limit=${BATCH_SIZE_DISCOVERY}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error(`Bullaware API error (traders): ${response.status}`);

    const data = await response.json();
    const traders = data.items || data.data || [];
    const totalPages = Math.ceil((data.total || 0) / BATCH_SIZE_DISCOVERY) || 1;

    if (traders.length > 0) {
        const toUpsert = traders.map((t: any) => ({
            etoro_username: t.username || t.userName,
            display_name: t.displayName || t.fullName,
            avatar_url: t.avatarUrl || t.avatar,
            copiers: t.copiers ?? 0,
        }));
        await supabase.from('traders').upsert(toUpsert, { onConflict: 'etoro_username', ignoreDuplicates: true });
    }

    const isComplete = currentPage >= totalPages;
    await supabase.from('sync_state').upsert({
        id: 'traders_discovery',
        status: isComplete ? 'idle' : 'paginating',
        last_page: isComplete ? 1 : currentPage + 1,
        last_run: isComplete ? new Date().toISOString() : state?.last_run,
        updated_at: new Date().toISOString()
    });

    return { discovered: traders.length, page: currentPage, totalPages, status: isComplete ? 'idle' : 'paginating' };
}

async function getStaleTraders(supabase: SupabaseClient): Promise<Trader[]> {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - STALE_THRESHOLD_HOURS.DETAILS);

  const { data, error } = await supabase
    .from('traders')
    .select('id, etoro_username')
    .or(`details_synced_at.is.null,details_synced_at.lt.${threshold.toISOString()}`)
    .order('copiers', { ascending: false })
    .limit(BATCH_SIZE_PROCESSING);

  if (error) {
      console.error('[sync-worker] Error fetching stale traders:', error);
      return [];
  }
  return data || [];
}


// --- Main Worker Entry Point ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const bullwareApiKey = Deno.env.get('BULLAWARE_API_KEY');

  if (!bullwareApiKey) {
    return new Response(JSON.stringify({ error: 'BULLAWARE_API_KEY not set' }), { status: 500 });
  }

  try {
    const { data: statesData, error: stateError } = await supabase.from('sync_state').select('*');
    if (stateError) throw stateError;
    const states: Record<string, SyncState> = (statesData || []).reduce((acc, s) => ({ ...acc, [s.id]: s }), {});

    const discoveryState = states['traders_discovery'];
    if (!discoveryState || discoveryState.status === 'paginating' || isStale(discoveryState.last_run, STALE_THRESHOLD_HOURS.DISCOVERY)) {
      try {
          const result = await discoverTraders(supabase, bullwareApiKey, discoveryState);
          return new Response(JSON.stringify({ action: 'discovery', ...result }), { headers: corsHeaders });
      } catch (e) {
          console.error('[sync-worker] Discovery failed:', e);
           // If discovery fails, we might want to let it retry next time, but ensure we don't crash
           return new Response(JSON.stringify({ action: 'discovery', error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: corsHeaders });
      }
    }

    const staleTraders = await getStaleTraders(supabase);
    if (staleTraders.length > 0) {
      const traderToProcess = staleTraders[0];
      await syncCompleteTraderDetails(supabase, bullwareApiKey, traderToProcess);
      await supabase.from('sync_state').upsert({ id: 'trader_details_sync', last_run: new Date().toISOString() });
      return new Response(JSON.stringify({ action: 'details_sync', status: 'success', trader: traderToProcess.etoro_username }), { headers: corsHeaders });
    }
    
    console.log('[sync-worker] No tasks to perform. All data is fresh.');
    return new Response(JSON.stringify({ action: 'idle', message: 'All data is fresh' }), { headers: corsHeaders });

  } catch (error) {
    console.error(`[sync-worker] Fatal error during execution: ${error.message}`);
    return new Response(JSON.stringify({ action: 'error', error: error.message }), { status: 500 });
  }
});
