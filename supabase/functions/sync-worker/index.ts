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
const BATCH_SIZE_DISCOVERY = 50;  // How many traders to discover in one run.
const BATCH_SIZE_PROCESSING = 1;   // How many traders to process in one run (kept low to stay under 60s timeout).
const RATE_LIMIT_DELAY_MS = 6000;  // 6s delay between API calls to respect 10 req/min limit.
const STALE_THRESHOLD_HOURS = {
    DISCOVERY: 6, // Re-run discovery every 6 hours.
    DETAILS: 2,   // Sync trader details if they are older than 2 hours.
    ASSETS: 24,   // Refresh asset list every 24 hours.
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

// --- Core API Logic ---

/**
 * Fetches all the detailed data for a single trader from Bullaware and updates the database.
 * This is the REAL implementation, moved from the ignored `process-queue` function.
 */
async function syncCompleteTraderDetails(supabase: SupabaseClient, apiKey: string, trader: Trader) {
  const { id, etoro_username } = trader;
  console.log(`[sync-worker] Starting full detail sync for ${etoro_username}`);

  // 1. Fetch Investor Details
  const detailsRes = await fetch(ENDPOINTS.investorDetails(etoro_username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (detailsRes.ok) {
    const data = await detailsRes.json();
    const investor = data.investor || data.data || data;
    await supabase.from('traders').update({
       profitable_weeks_pct: investor.profitableWeeksPct,
       profitable_months_pct: investor.profitableMonthsPct,
       daily_drawdown: investor.dailyDD,
       weekly_drawdown: investor.weeklyDD,
    }).eq('id', id);
  }
  await delay(RATE_LIMIT_DELAY_MS);

  // 2. Fetch Risk Score
  const riskRes = await fetch(ENDPOINTS.riskScore(etoro_username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (riskRes.ok) {
    const data = await riskRes.json();
    const score = typeof data === 'number' ? data : (data.riskScore || data.points?.[data.points.length - 1]?.riskScore);
    if (score) await supabase.from('traders').update({ risk_score: score }).eq('id', id);
  }
  await delay(RATE_LIMIT_DELAY_MS);

  // 3. Fetch Metrics
  const metricsRes = await fetch(ENDPOINTS.metrics(etoro_username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (metricsRes.ok) {
    const data = await metricsRes.json();
    const m = data.data || data;
    await supabase.from('traders').update({
       sharpe_ratio: m.sharpeRatio,
       sortino_ratio: m.sortinoRatio,
       alpha: m.alpha,
       beta: m.beta,
    }).eq('id', id);
  }

  // 4. Finalize: Mark as synced
  await supabase.from('traders').update({ details_synced_at: new Date().toISOString() }).eq('id', id);
  console.log(`[sync-worker] Finished full detail sync for ${etoro_username}`);
}


/**
 * Discovers new traders from the Bullaware API and adds them to our database.
 */
async function discoverTraders(supabase: SupabaseClient, apiKey: string, state: SyncState | undefined) {
    const currentPage = state?.status === 'paginating' ? state.last_page : 1;
    console.log(`[sync-worker] Running discovery: page ${currentPage}`);

    const response = await fetch(`${ENDPOINTS.investors}?page=${currentPage}&limit=${BATCH_SIZE_DISCOVERY}`, {
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

/**
 * Finds traders in our database whose details are missing or stale.
 */
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

    // --- Task Prioritization ---

    // 1. Should we run discovery? (In progress, or stale)
    const discoveryState = states['traders_discovery'];
    if (!discoveryState || discoveryState.status === 'paginating' || isStale(discoveryState.last_run, STALE_THRESHOLD_HOURS.DISCOVERY)) {
      const result = await discoverTraders(supabase, bullwareApiKey, discoveryState);
      return new Response(JSON.stringify({ action: 'discovery', ...result }), { headers: corsHeaders });
    }

    // 2. Are there stale traders to process? (Highest priority after discovery)
    const staleTraders = await getStaleTraders(supabase);
    if (staleTraders.length > 0) {
      const traderToProcess = staleTraders[0]; // Process one at a time
      await syncCompleteTraderDetails(supabase, bullwareApiKey, traderToProcess);
      await supabase.from('sync_state').upsert({ id: 'trader_details_sync', last_run: new Date().toISOString() });
      return new Response(JSON.stringify({ action: 'details_sync', trader: traderToProcess.etoro_username }), { headers: corsHeaders });
    }
    
    // Fallback: If nothing else to do, just report it.
    console.log('[sync-worker] No tasks to perform. All data is fresh.');
    return new Response(JSON.stringify({ action: 'idle', message: 'All data is fresh' }), { headers: corsHeaders });

  } catch (error) {
    console.error('[sync-worker] Fatal error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
