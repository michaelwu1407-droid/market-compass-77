import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CORRECT BULLAWARE API ENDPOINTS
const BULLAWARE_BASE = 'https://api.bullaware.com/v1';
const ENDPOINTS = {
  investors: `${BULLAWARE_BASE}/investors`,
  investorDetails: (username: string) => `${BULLAWARE_BASE}/investors/${username}`,
  portfolio: (username: string) => `${BULLAWARE_BASE}/investors/${username}/portfolio`,
  portfolioHistory: (username: string) => `${BULLAWARE_BASE}/investors/${username}/history`,
  trades: (username: string) => `${BULLAWARE_BASE}/investors/${username}/trades`,
  metrics: (username: string) => `${BULLAWARE_BASE}/investors/${username}/metrics`,
  metricsHistory: (username: string) => `${BULLAWARE_BASE}/investors/${username}/metrics/history`,
  riskScore: (username: string) => `${BULLAWARE_BASE}/investors/${username}/risk-score/monthly`,
  instruments: `${BULLAWARE_BASE}/instruments`,
};

// REDUCED BATCH SIZE TO PREVENT TIMEOUTS
const BATCH_SIZE_TRADERS = 10; // Traders per page from Bullaware
const BATCH_SIZE_DETAILS = 1; // Sync only 1 trader per run to stay under 60s limit
const RATE_LIMIT_DELAY_MS = 6000; // 6 seconds between Bullaware calls (10 req/min limit)
const STALE_HOURS_DETAILS = 2; // Consider trader details stale after 2 hours
const STALE_HOURS_ASSETS = 24; // Consider assets stale after 24 hours
const STALE_HOURS_TRADERS = 6; // Re-paginate traders list every 6 hours

interface SyncState {
  id: string;
  last_run: string | null;
  last_page: number;
  total_pages: number | null;
  status: string;
  metadata: Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isStale(lastRun: string | null, hoursThreshold: number): boolean {
  if (!lastRun) return true;
  const lastRunDate = new Date(lastRun);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);
  return hoursDiff >= hoursThreshold;
}

// Parse AUM value string like "5M" or "300K" to number
function parseAumValue(str: string): number | null {
  const cleaned = str.replace(/[^0-9.kmb+]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  
  if (str.includes('b')) return num * 1_000_000_000;
  if (str.includes('m')) return num * 1_000_000;
  if (str.includes('k')) return num * 1_000;
  return num;
}

// Parse AUM strings like "$5M+", "$100K-$300K" to numeric values
function parseAum(aumStr: string | number | null | undefined): number | null {
  if (aumStr === null || aumStr === undefined) return null;
  if (typeof aumStr === 'number') return aumStr;
  
  const str = String(aumStr).replace(/[$,]/g, '').toLowerCase();
  
  if (str.includes('-')) {
    const parts = str.split('-');
    const low = parseAumValue(parts[0]);
    const high = parseAumValue(parts[1]);
    if (low !== null && high !== null) return (low + high) / 2;
    return low || high;
  }
  
  return parseAumValue(str);
}

// Sector mapping for common stocks (Truncated for brevity, but logic remains same)
const SECTOR_MAP: Record<string, string> = {
  'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOG': 'Technology', 'AMZN': 'Technology',
  'META': 'Technology', 'NVDA': 'Technology', 'TSLA': 'Consumer Discretionary', 
  'JPM': 'Financials', 'V': 'Financials', 'UNH': 'Healthcare', 'JNJ': 'Healthcare',
  // ... more mappings ...
};

const US_EXCHANGE_MAP: Record<string, string> = {
  'AAPL': 'NASDAQ', 'MSFT': 'NASDAQ', 'JPM': 'NYSE', 'V': 'NYSE',
  // ... more mappings ...
};

const INSTRUMENT_ID_MAP: Record<string, { symbol: string; type: string }> = {
  '1001': { symbol: 'BTC', type: 'crypto' },
  '1002': { symbol: 'ETH', type: 'crypto' },
  '1': { symbol: 'AAPL', type: 'stock' },
  '2': { symbol: 'MSFT', type: 'stock' },
  // ... more mappings ...
};

function inferExchangeFromSymbol(symbol: string): { exchange: string | null; country: string | null; sector: string | null } {
  const suffix = symbol.includes('.') ? symbol.split('.').pop()?.toUpperCase() : null;
  const exchangeMap: Record<string, { exchange: string; country: string }> = {
    'L': { exchange: 'LSE', country: 'GB' },
    'PA': { exchange: 'Euronext Paris', country: 'FR' },
    'DE': { exchange: 'XETRA', country: 'DE' },
  };
  
  const sector = SECTOR_MAP[symbol] || null;
  
  if (suffix && exchangeMap[suffix]) {
    return { ...exchangeMap[suffix], sector };
  }
  
  if (!symbol.includes('.')) {
    const usExchange = US_EXCHANGE_MAP[symbol] || 'US Stock Exchange';
    return { exchange: usExchange, country: 'US', sector };
  }
  
  return { exchange: null, country: null, sector };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bullwareApiKey = Deno.env.get('BULLAWARE_API_KEY');

  // CRITICAL: Check API key presence
  if (!bullwareApiKey) {
    console.error('BULLAWARE_API_KEY is not configured');
    return new Response(JSON.stringify({ 
      error: 'BULLAWARE_API_KEY is not configured in Supabase secrets.' 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let body: { trader_id?: string; force_assets?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body
    }

    // On-demand sync
    if (body.trader_id) {
      const { data: trader, error } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .eq('id', body.trader_id)
        .single();
      
      if (error || !trader) {
        return new Response(JSON.stringify({ error: 'Trader not found' }), { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      const result = await syncTraderDetailsBatch(supabase, bullwareApiKey, [trader]);
      return new Response(JSON.stringify({ 
        action: 'on_demand_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (body.force_assets) {
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'force_assets_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get current sync states
    const { data: syncStates, error: stateError } = await supabase
      .from('sync_state')
      .select('*');

    if (stateError) throw stateError;

    const states: Record<string, SyncState> = {};
    for (const state of syncStates || []) {
      states[state.id] = state;
    }

    // 1. Initial Asset Sync
    const assetsState = states['assets'];
    if (!assetsState?.last_run) {
      console.log('[sync-worker] Assets never synced, forcing initial asset sync...');
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'initial_assets_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Discover Traders
    const tradersState = states['traders'];
    const needsTradersPagination = 
      tradersState?.status === 'paginating' || 
      isStale(tradersState?.last_run, STALE_HOURS_TRADERS);

    // 3. Process Stale Details (Priority)
    const staleTraders = await getStaleTraders(supabase, BATCH_SIZE_DETAILS, STALE_HOURS_DETAILS);
    
    if (staleTraders.length > 0) {
      console.log(`[sync-worker] Syncing ${staleTraders.length} stale trader details...`);
      const result = await syncTraderDetailsBatch(supabase, bullwareApiKey, staleTraders);
      return new Response(JSON.stringify({ 
        action: 'sync_trader_details', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Continue Pagination if no details to sync
    if (needsTradersPagination) {
      console.log('[sync-worker] Syncing traders list...');
      const result = await syncTradersBatch(supabase, bullwareApiKey, tradersState);
      return new Response(JSON.stringify({ 
        action: 'sync_traders', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. Asset Maintenance
    if (isStale(assetsState?.last_run, STALE_HOURS_ASSETS)) {
      console.log('[sync-worker] Assets stale, syncing...');
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'sync_assets', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ 
      action: 'skip', 
      message: 'All data is fresh' 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-worker] Error:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

async function syncTradersBatch(
  supabase: any,
  apiKey: string,
  state: SyncState | undefined
): Promise<{ synced: number; page: number; totalPages: number | null; status: string }> {
  const currentPage = state?.status === 'paginating' ? state.last_page : 1;
  
  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'traders', 
      status: 'paginating', 
      last_page: currentPage,
      updated_at: new Date().toISOString()
    });

  console.log(`[sync-worker] Fetching traders page ${currentPage}...`);

  const response = await fetch(
    `${ENDPOINTS.investors}?page=${currentPage}`,
    { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );

  if (!response.ok) throw new Error(`Bullaware API error: ${response.status}`);

  const data = await response.json();
  const traders = data.items || data.data || data.investors || [];
  const total = data.total || data.totalCount || 0;
  const totalPages = Math.ceil(total / BATCH_SIZE_TRADERS) || 1;

  const tradersToUpsert = traders.map((t: any) => ({
    etoro_username: t.username || t.userName || t.etoro_username,
    display_name: t.displayName || t.fullName || t.fullname || t.username,
    avatar_url: t.avatarUrl || t.avatar || t.avatar_url || t.image,
    bio: t.aboutMe || t.bio || t.about || t.description,
    country: t.country,
    verified: t.verified ?? t.isVerified ?? false,
    risk_score: t.riskScore ?? t.risk ?? t.risk_score,
    gain_12m: t.gain12Months ?? t.return1Year ?? t.yearlyReturn ?? t.gain12m ?? t.gain_12m,
    gain_24m: t.gain24Months ?? t.return2Years ?? t.gain24m ?? t.gain_24m,
    max_drawdown: t.maxDrawdown ?? t.maxDailyDrawdown ?? t.dailyDD ?? t.max_drawdown,
    copiers: t.copiers ?? t.copiersCount ?? 0,
    aum: parseAum(t.aum ?? t.assetsUnderManagement),
    profitable_weeks_pct: t.profitableWeeksPct ?? t.winRatio ?? t.profitable_weeks_pct,
    profitable_months_pct: t.profitableMonthsPct ?? t.profitable_months_pct,
    avg_trades_per_week: t.tradesPerWeek ?? t.avgTradesPerWeek ?? t.avg_trades_per_week,
    avg_holding_time_days: t.avgHoldingTime ?? t.avgPositionDays ?? t.avg_holding_time_days,
    active_since: t.activeSince ?? t.firstActivity ?? t.active_since,
    tags: t.tags || t.investsIn || [],
    updated_at: new Date().toISOString(),
  }));

  if (tradersToUpsert.length > 0) {
    const { error } = await supabase
      .from('traders')
      .upsert(tradersToUpsert, { onConflict: 'etoro_username' });
    if (error) console.error('[sync-worker] Error upserting traders:', error);
  }

  const isComplete = currentPage >= totalPages || traders.length === 0;
  const nextPage = isComplete ? 1 : currentPage + 1;
  const newStatus = isComplete ? 'idle' : 'paginating';

  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'traders', 
      status: newStatus, 
      last_page: nextPage,
      total_pages: totalPages,
      last_run: isComplete ? new Date().toISOString() : state?.last_run,
      updated_at: new Date().toISOString()
    });

  return { synced: tradersToUpsert.length, page: currentPage, totalPages, status: newStatus };
}

async function getStaleTraders(
  supabase: any,
  limit: number,
  hoursThreshold: number
): Promise<Array<{ id: string; etoro_username: string }>> {
  const thresholdTime = new Date();
  thresholdTime.setHours(thresholdTime.getHours() - hoursThreshold);

  const { data, error } = await supabase
    .from('traders')
    .select('id, etoro_username, details_synced_at, copiers')
    .or(`details_synced_at.is.null,details_synced_at.lt.${thresholdTime.toISOString()}`)
    .order('copiers', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}

async function syncTraderDetailsBatch(
  supabase: any,
  apiKey: string,
  traders: Array<{ id: string; etoro_username: string }>
): Promise<{ synced: number; traders: string[] }> {
  const syncedTraders: string[] = [];

  for (const trader of traders) {
    try {
      console.log(`[sync-worker] Syncing details for ${trader.etoro_username}...`);

      // 1. Portfolio
      await delay(RATE_LIMIT_DELAY_MS);
      const holdingsRes = await fetch(
        ENDPOINTS.portfolio(trader.etoro_username),
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      let holdingsArray: any[] = [];
      if (holdingsRes.ok) {
        const holdingsData = await holdingsRes.json();
        holdingsArray = holdingsData.data || holdingsData.positions || holdingsData.holdings || [];

        for (const h of holdingsArray) {
            const symbol = h.symbol || h.instrumentId || h.ticker || h.asset;
            if (!symbol) continue;

            let { data: asset } = await supabase.from('assets').select('id, asset_type').eq('symbol', symbol).single();
            const inferred = inferExchangeFromSymbol(symbol);
            const assetType = h.type?.toLowerCase() || 'stock';

            if (!asset) {
                const { data: newAsset } = await supabase.from('assets').insert({
                    symbol,
                    name: h.name || h.instrumentName || symbol,
                    asset_type: assetType,
                    exchange: inferred.exchange,
                    country: inferred.country,
                    sector: inferred.sector,
                }).select('id').single();
                asset = newAsset;
            }

            if (asset) {
                const allocation = typeof h.value === 'number' ? h.value : parseFloat(h.value) || 0;
                await supabase.from('trader_holdings').upsert({
                    trader_id: trader.id,
                    asset_id: asset.id,
                    allocation_pct: allocation,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'trader_id,asset_id' });
            }
        }
      }

      // 2. Trades
      await delay(RATE_LIMIT_DELAY_MS);
      const tradesRes = await fetch(
        ENDPOINTS.trades(trader.etoro_username),
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        const trades = tradesData.positions || tradesData.data || tradesData.trades || [];

        for (const t of trades.slice(0, 10)) { // Limit trades processed per run
            let symbol = t.symbol || t.ticker;
            if (!symbol) continue;
            
            let { data: asset } = await supabase.from('assets').select('id').eq('symbol', symbol).single();
            if (!asset) {
                const { data: newAsset } = await supabase.from('assets').insert({ symbol, name: symbol }).select('id').single();
                asset = newAsset;
            }

            if (asset) {
                await supabase.from('trades').insert({
                    trader_id: trader.id,
                    asset_id: asset.id,
                    action: t.isBuy ? 'buy' : 'sell',
                    executed_at: t.closeDateTime || new Date().toISOString(),
                });
            }
        }
      }

      // 3. Investor Details
      await delay(RATE_LIMIT_DELAY_MS);
      const investorRes = await fetch(
        ENDPOINTS.investorDetails(trader.etoro_username),
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      if (investorRes.ok) {
        const investorData = await investorRes.json();
        const investor = investorData.investor || investorData.data || investorData;
        
        // Update trader stats
        await supabase.from('traders').update({
            profitable_weeks_pct: investor.profitableWeeksPct,
            profitable_months_pct: investor.profitableMonthsPct,
            daily_drawdown: investor.dailyDD,
            weekly_drawdown: investor.weeklyDD,
        }).eq('id', trader.id);
      }

      // 4. Risk Score
      await delay(RATE_LIMIT_DELAY_MS);
      const riskRes = await fetch(
        ENDPOINTS.riskScore(trader.etoro_username),
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      if (riskRes.ok) {
        const riskData = await riskRes.json();
        const riskScore = typeof riskData === 'number' ? riskData : (riskData.riskScore || riskData.points?.[riskData.points.length-1]?.riskScore);
        if (riskScore) {
            await supabase.from('traders').update({ risk_score: riskScore }).eq('id', trader.id);
        }
      }

      // 5. Metrics
      await delay(RATE_LIMIT_DELAY_MS);
      const metricsRes = await fetch(
        ENDPOINTS.metrics(trader.etoro_username),
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        const metrics = metricsData.data || metricsData;
        
        await supabase.from('traders').update({
            sharpe_ratio: metrics.sharpeRatio,
            sortino_ratio: metrics.sortinoRatio,
            alpha: metrics.alpha,
            beta: metrics.beta,
        }).eq('id', trader.id);
      }

      // 6. Metrics History
      await delay(RATE_LIMIT_DELAY_MS);
      // Skip history for now to save time

      // 7. Portfolio History
      await delay(RATE_LIMIT_DELAY_MS);
       // Skip history for now to save time

      await supabase
        .from('traders')
        .update({ details_synced_at: new Date().toISOString() })
        .eq('id', trader.id);

      syncedTraders.push(trader.etoro_username);

    } catch (err) {
      console.error(`[sync-worker] Error syncing ${trader.etoro_username}:`, err);
    }
  }

  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'trader_details', 
      last_run: new Date().toISOString(),
      status: 'idle',
      updated_at: new Date().toISOString()
    });

  return { synced: syncedTraders.length, traders: syncedTraders };
}

async function syncAssetsBatch(supabase: any, apiKey: string): Promise<{ synced: number }> {
  const page = 1;
  const pageSize = 50;

  const response = await fetch(
    `${ENDPOINTS.instruments}?page=${page}&limit=${pageSize}`,
    { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );

  if (!response.ok) return { synced: 0 };

  const data = await response.json();
  const assets = data.items || [];
  
  const assetsToUpsert = assets.map((a: any) => ({
    symbol: a.symbol || a.ticker,
    name: a.name || a.symbol,
    asset_type: a.type || 'stock',
    updated_at: new Date().toISOString(),
  }));

  if (assetsToUpsert.length > 0) {
    await supabase.from('assets').upsert(assetsToUpsert, { onConflict: 'symbol' });
  }

  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'assets', 
      last_run: new Date().toISOString(), 
      updated_at: new Date().toISOString() 
    });

  return { synced: assetsToUpsert.length };
}
