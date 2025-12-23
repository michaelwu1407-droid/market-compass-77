import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CORRECT BULLAWARE API ENDPOINTS
const BULLAWARE_BASE = 'https://api.bullaware.com/v1';
const ENDPOINTS = {
  investors: `${BULLAWARE_BASE}/investors`,
  investorDetails: (username: string) => `${BULLAWARE_BASE}/investors/${username}`, // Contains monthlyReturns, yearlyReturns, profitableWeeksPct, etc.
  portfolio: (username: string) => `${BULLAWARE_BASE}/investors/${username}/portfolio`,
  portfolioHistory: (username: string) => `${BULLAWARE_BASE}/investors/${username}/history`, // Portfolio composition over time
  trades: (username: string) => `${BULLAWARE_BASE}/investors/${username}/trades`,
  metrics: (username: string) => `${BULLAWARE_BASE}/investors/${username}/metrics`,
  metricsHistory: (username: string) => `${BULLAWARE_BASE}/investors/${username}/metrics/history`, // Equity curve over time
  riskScore: (username: string) => `${BULLAWARE_BASE}/investors/${username}/risk-score/monthly`,
  instruments: `${BULLAWARE_BASE}/instruments`,
};

const BATCH_SIZE_TRADERS = 10; // Traders per page from Bullaware
const BATCH_SIZE_DETAILS = 2; // Trader details to sync per run (reduced to avoid rate limits)
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
  
  // Handle ranges like "100k-300k" - take midpoint
  if (str.includes('-')) {
    const parts = str.split('-');
    const low = parseAumValue(parts[0]);
    const high = parseAumValue(parts[1]);
    if (low !== null && high !== null) return (low + high) / 2;
    return low || high;
  }
  
  return parseAumValue(str);
}

// Infer exchange/country from symbol suffix (e.g. ".L" = London, ".PA" = Paris)
function inferExchangeFromSymbol(symbol: string): { exchange: string | null; country: string | null } {
  const suffix = symbol.includes('.') ? symbol.split('.').pop()?.toUpperCase() : null;
  const exchangeMap: Record<string, { exchange: string; country: string }> = {
    'L': { exchange: 'LSE', country: 'GB' },
    'PA': { exchange: 'Euronext Paris', country: 'FR' },
    'DE': { exchange: 'XETRA', country: 'DE' },
    'AS': { exchange: 'Euronext Amsterdam', country: 'NL' },
    'MI': { exchange: 'Borsa Italiana', country: 'IT' },
    'MC': { exchange: 'BME', country: 'ES' },
    'SW': { exchange: 'SIX', country: 'CH' },
    'HK': { exchange: 'HKEX', country: 'HK' },
    'T': { exchange: 'TSE', country: 'JP' },
    'TW': { exchange: 'TWSE', country: 'TW' },
    'AX': { exchange: 'ASX', country: 'AU' },
    'TO': { exchange: 'TSX', country: 'CA' },
  };
  if (suffix && exchangeMap[suffix]) {
    return exchangeMap[suffix];
  }
  // No suffix typically means US stock
  if (!symbol.includes('.')) {
    return { exchange: null, country: 'US' };
  }
  return { exchange: null, country: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bullwareApiKey = Deno.env.get('BULLAWARE_API_KEY')!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check if this is an on-demand sync request for a specific trader
    let body: { trader_id?: string; force_assets?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body, regular sync
    }

    // On-demand sync for specific trader
    if (body.trader_id) {
      console.log(`[sync-worker] On-demand sync requested for trader ID: ${body.trader_id}`);
      
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
      
      console.log(`[sync-worker] On-demand syncing: ${trader.etoro_username}`);
      const result = await syncTraderDetailsBatch(supabase, bullwareApiKey, [trader]);
      return new Response(JSON.stringify({ 
        action: 'on_demand_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Force assets sync (can be triggered manually)
    if (body.force_assets) {
      console.log('[sync-worker] Force assets sync requested...');
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'force_assets_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[sync-worker] Starting sync cycle...');

    // Get current sync states
    const { data: syncStates, error: stateError } = await supabase
      .from('sync_state')
      .select('*');

    if (stateError) throw stateError;

    const states: Record<string, SyncState> = {};
    for (const state of syncStates || []) {
      states[state.id] = state;
    }

    // Priority 0: Force assets sync if never run (needed for sector/exchange/country data)
    const assetsState = states['assets'];
    if (!assetsState?.last_run) {
      console.log('[sync-worker] Assets never synced, forcing initial asset sync...');
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'initial_assets_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Priority 1: Check if we need to discover/refresh traders list
    const tradersState = states['traders'];
    const needsTradersPagination = 
      tradersState?.status === 'paginating' || 
      isStale(tradersState?.last_run, STALE_HOURS_TRADERS);

    // IMPORTANT: Also sync trader details while paginating traders
    // This ensures portfolio data gets populated even while we're still discovering traders
    const staleTraders = await getStaleTraders(supabase, BATCH_SIZE_DETAILS, STALE_HOURS_DETAILS);
    
    // Prioritize trader details if we have any stale ones (for portfolio data)
    if (staleTraders.length > 0) {
      console.log(`[sync-worker] Syncing ${staleTraders.length} stale trader details (priority over pagination)...`);
      const result = await syncTraderDetailsBatch(supabase, bullwareApiKey, staleTraders);
      return new Response(JSON.stringify({ 
        action: 'sync_trader_details', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (needsTradersPagination) {
      console.log('[sync-worker] Syncing traders list...');
      const result = await syncTradersBatch(supabase, bullwareApiKey, tradersState);
      return new Response(JSON.stringify({ 
        action: 'sync_traders', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Priority 2: Check if assets need refresh
    if (isStale(assetsState?.last_run, STALE_HOURS_ASSETS)) {
      console.log('[sync-worker] Assets stale, syncing...');
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'sync_assets', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[sync-worker] Everything is fresh, skipping this cycle.');
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTradersBatch(
  supabase: any,
  apiKey: string,
  state: SyncState | undefined
): Promise<{ synced: number; page: number; totalPages: number | null; status: string }> {
  const currentPage = state?.status === 'paginating' ? state.last_page : 1;
  
  // Update state to paginating
  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'traders', 
      status: 'paginating', 
      last_page: currentPage,
      updated_at: new Date().toISOString()
    });

  console.log(`[sync-worker] Fetching traders page ${currentPage} from ${ENDPOINTS.investors}...`);

  const response = await fetch(
    `${ENDPOINTS.investors}?page=${currentPage}`,
    { 
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      } 
    }
  );

  if (!response.ok) {
    throw new Error(`Bullaware API error: ${response.status}`);
  }

  const data = await response.json();
  const traders = data.items || data.data || data.investors || [];
  const total = data.total || data.totalCount || 0;
  const totalPages = Math.ceil(total / BATCH_SIZE_TRADERS) || 1;

  console.log(`[sync-worker] Got ${traders.length} traders from page ${currentPage}, total: ${total}`);

  // Map and upsert traders - use same field names as working sync-traders function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tradersToUpsert = traders.map((t: any) => ({
    etoro_username: t.username || t.userName || t.etoro_username,
    display_name: t.displayName || t.fullName || t.fullname || t.username || t.userName,
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
    
    if (error) {
      console.error('[sync-worker] Error upserting traders:', error);
    }
  }

  // Check if we've finished all pages
  const isComplete = currentPage >= totalPages || traders.length === 0;
  const nextPage = isComplete ? 1 : currentPage + 1;
  const newStatus = isComplete ? 'idle' : 'paginating';

  // Update state
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

  return { 
    synced: tradersToUpsert.length, 
    page: currentPage, 
    totalPages, 
    status: newStatus 
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStaleTraders(
  supabase: any,
  limit: number,
  hoursThreshold: number
): Promise<Array<{ id: string; etoro_username: string }>> {
  const thresholdTime = new Date();
  thresholdTime.setHours(thresholdTime.getHours() - hoursThreshold);

  // Use details_synced_at to check staleness (not updated_at which is set during list sync)
  // Order by copiers DESC to prioritize popular traders first
  const { data, error } = await supabase
    .from('traders')
    .select('id, etoro_username, details_synced_at, copiers')
    .or(`details_synced_at.is.null,details_synced_at.lt.${thresholdTime.toISOString()}`)
    .order('copiers', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('[sync-worker] Error fetching stale traders:', error);
    return [];
  }

  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTraderDetailsBatch(
  supabase: any,
  apiKey: string,
  traders: Array<{ id: string; etoro_username: string }>
): Promise<{ synced: number; traders: string[] }> {
  const syncedTraders: string[] = [];

  for (const trader of traders) {
    try {
      console.log(`[sync-worker] Syncing details for ${trader.etoro_username}...`);

      // Fetch portfolio
      const holdingsRes = await fetch(
        ENDPOINTS.portfolio(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (holdingsRes.ok) {
        const holdingsData = await holdingsRes.json();
        const holdings = holdingsData.data || holdingsData.positions || holdingsData.holdings || [];

        console.log(`[sync-worker] Got ${holdings.length} holdings for ${trader.etoro_username}`);
        
        // DEBUG: Log first holding to see available fields
        if (holdings.length > 0) {
          console.log(`[sync-worker] Sample holding fields for ${trader.etoro_username}:`, JSON.stringify(holdings[0], null, 2));
        }

        // Process holdings
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const h of holdings as any[]) {
          const symbol = h.symbol || h.instrumentId || h.ticker || h.asset;
          if (!symbol) continue;

          // Get or create asset, enriching with data from holdings
          let { data: asset } = await supabase
            .from('assets')
            .select('id, asset_type, exchange, country')
            .eq('symbol', symbol)
            .single();

          // Infer exchange/country from symbol suffix
          const inferred = inferExchangeFromSymbol(symbol);
          
          // Map Bullaware type to our asset_type
          const assetType = h.type?.toLowerCase() || 'stock';
          
          if (!asset) {
            // Create asset with enriched data from holdings
            const { data: newAsset } = await supabase
              .from('assets')
              .insert({ 
                symbol, 
                name: h.name || h.instrumentName || symbol,
                asset_type: assetType,
                exchange: inferred.exchange,
                country: inferred.country,
              })
              .select('id, asset_type, exchange, country')
              .single();
            asset = newAsset;
            console.log(`[sync-worker] Created asset ${symbol} with type=${assetType}, exchange=${inferred.exchange}, country=${inferred.country}`);
          } else {
            // Update asset if missing type/exchange/country
            const updates: Record<string, unknown> = {};
            if (!asset.asset_type || asset.asset_type === 'stock') {
              updates.asset_type = assetType;
            }
            if (!asset.exchange && inferred.exchange) {
              updates.exchange = inferred.exchange;
            }
            if (!asset.country && inferred.country) {
              updates.country = inferred.country;
            }
            if (Object.keys(updates).length > 0) {
              await supabase.from('assets').update(updates).eq('id', asset.id);
              console.log(`[sync-worker] Updated asset ${symbol} with:`, updates);
            }
          }

          if (asset) {
            // Bullaware API returns:
            // - "value": percentage allocation of portfolio (e.g. 7.659151 = 7.66%)
            // - "netProfit": P&L percentage (can be negative)
            const allocationValue = h.value ?? h.allocationPct ?? h.allocation_pct ?? h.allocation ?? h.weight ?? h.percentage ?? h.invested;
            const allocation = typeof allocationValue === 'number' ? allocationValue : parseFloat(allocationValue) || 0;
            
            // netProfit is the P&L field from Bullaware
            const pnlValue = h.netProfit ?? h.profitLossPct ?? h.profit_loss_pct ?? h.pnl ?? h.gain ?? h.profitLoss ?? h.pl ?? h.unrealizedPnl ?? h.unrealizedPnlPct ?? h.returnPct ?? h.returns;
            const pnl = typeof pnlValue === 'number' ? pnlValue : (pnlValue ? parseFloat(pnlValue) : null);
            
            await supabase
              .from('trader_holdings')
              .upsert({
                trader_id: trader.id,
                asset_id: asset.id,
                allocation_pct: allocation, // This is the primary allocation field
                avg_open_price: h.avgOpenPrice ?? h.avg_open_price ?? h.openPrice ?? h.openRate ?? h.avgPrice,
                current_value: allocation, // Keep as backup
                profit_loss_pct: pnl, // P&L percentage
                updated_at: new Date().toISOString(),
              }, { onConflict: 'trader_id,asset_id' });
          }
        }
      } else {
        console.log(`[sync-worker] Portfolio fetch failed for ${trader.etoro_username}: ${holdingsRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch instruments to build instrumentId -> symbol mapping
      let instrumentMap: Record<string, { symbol: string; name: string; type: string }> = {};
      try {
        const instrumentsRes = await fetch(
          `${ENDPOINTS.instruments}?limit=1000`,
          { 
            headers: { 
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            } 
          }
        );
        
        if (instrumentsRes.ok) {
          const instrumentsData = await instrumentsRes.json();
          const instruments = instrumentsData.items || instrumentsData.data || instrumentsData.instruments || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const inst of instruments as any[]) {
            const instId = String(inst.instrumentId || inst.id);
            instrumentMap[instId] = {
              symbol: inst.symbol || inst.ticker || instId,
              name: inst.name || inst.displayName || inst.instrumentName || inst.symbol || instId,
              type: (inst.type || inst.instrumentType || 'stock').toLowerCase(),
            };
          }
          console.log(`[sync-worker] Built instrument map with ${Object.keys(instrumentMap).length} entries`);
        }
      } catch (err) {
        console.log(`[sync-worker] Could not fetch instruments for mapping:`, err);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch trades
      const tradesRes = await fetch(
        ENDPOINTS.trades(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        // Bullaware returns trades in "positions" array for closed positions
        const trades = tradesData.positions || tradesData.data || tradesData.trades || tradesData.items || [];

        console.log(`[sync-worker] Got ${trades.length} trades for ${trader.etoro_username}`);
        
        // DEBUG: Log first trade to see available fields
        if (trades.length > 0) {
          console.log(`[sync-worker] Sample trade fields for ${trader.etoro_username}:`, JSON.stringify(trades[0], null, 2));
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of (trades as any[]).slice(0, 20)) {
          // First try to get symbol directly, then fallback to instrumentId lookup
          let symbol = t.symbol || t.ticker;
          let assetName = t.name || t.instrumentName;
          let assetType = 'stock';
          
          // If we only have instrumentId, look it up
          if (!symbol && t.instrumentId) {
            const instId = String(t.instrumentId);
            const mapped = instrumentMap[instId];
            if (mapped) {
              symbol = mapped.symbol;
              assetName = assetName || mapped.name;
              assetType = mapped.type;
              console.log(`[sync-worker] Mapped instrumentId ${instId} -> ${symbol}`);
            } else {
              // Skip trades with unknown instrumentId
              console.log(`[sync-worker] Unknown instrumentId ${instId}, skipping trade`);
              continue;
            }
          }
          
          if (!symbol) continue;

          // Infer exchange/country from symbol
          const inferred = inferExchangeFromSymbol(symbol);

          let { data: asset } = await supabase
            .from('assets')
            .select('id')
            .eq('symbol', symbol)
            .single();

          if (!asset) {
            const { data: newAsset } = await supabase
              .from('assets')
              .insert({ 
                symbol, 
                name: assetName || symbol,
                asset_type: assetType,
                exchange: inferred.exchange,
                country: inferred.country,
              })
              .select('id')
              .single();
            asset = newAsset;
          }

          if (asset) {
            // Bullaware positions array fields: isBuy, openRate, closeRate, openDateTime, closeDateTime, netProfit
            await supabase
              .from('trades')
              .upsert({
                trader_id: trader.id,
                asset_id: asset.id,
                action: t.action || t.side || t.type || (t.isBuy === true ? 'buy' : t.isBuy === false ? 'sell' : 'unknown'),
                amount: t.amount ?? t.units ?? t.quantity ?? t.netProfit,
                price: t.price ?? t.openRate ?? t.openPrice ?? t.rate ?? t.closeRate,
                percentage_of_portfolio: t.portfolioPercentage ?? t.weight,
                executed_at: t.executedAt ?? t.closeDateTime ?? t.openDateTime ?? t.openDate ?? t.date ?? t.timestamp,
              }, { ignoreDuplicates: true });
          }
        }
      } else {
        console.log(`[sync-worker] Trades fetch failed for ${trader.etoro_username}: ${tradesRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch investor details (contains monthlyReturns, yearlyReturns, profitableWeeksPct, etc.)
      const investorRes = await fetch(
        ENDPOINTS.investorDetails(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (investorRes.ok) {
        const investorData = await investorRes.json();
        const investor = investorData.investor || investorData.data || investorData;
        
        console.log(`[sync-worker] Got investor details for ${trader.etoro_username}:`, JSON.stringify({
          hasMonthlyReturns: !!investor.monthlyReturns,
          monthlyReturnsKeys: investor.monthlyReturns ? Object.keys(investor.monthlyReturns).slice(0, 5) : [],
          profitableWeeksPct: investor.profitableWeeksPct,
          profitableMonthsPct: investor.profitableMonthsPct,
          dailyDD: investor.dailyDD,
          weeklyDD: investor.weeklyDD,
        }, null, 2));
        
        // Extract and save monthly returns (format: {"2021-01": 5.5, "2021-02": 9.2})
        const monthlyReturns = investor.monthlyReturns || {};
        const monthlyEntries = Object.entries(monthlyReturns);
        
        if (monthlyEntries.length > 0) {
          console.log(`[sync-worker] Saving ${monthlyEntries.length} monthly performance records for ${trader.etoro_username}`);
          
          for (const [key, value] of monthlyEntries) {
            // Key format is "YYYY-MM" e.g. "2024-01"
            const parts = key.split('-');
            if (parts.length >= 2) {
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10);
              
              if (!isNaN(year) && !isNaN(month) && typeof value === 'number') {
                await supabase
                  .from('trader_performance')
                  .upsert({
                    trader_id: trader.id,
                    year,
                    month,
                    return_pct: value,
                  }, { onConflict: 'trader_id,year,month' });
              }
            }
          }
        }
        
        // Update trader with additional stats from investor details
        const traderUpdates: Record<string, unknown> = {};
        
        if (investor.profitableWeeksPct !== undefined && investor.profitableWeeksPct !== null) {
          traderUpdates.profitable_weeks_pct = investor.profitableWeeksPct;
        }
        if (investor.profitableMonthsPct !== undefined && investor.profitableMonthsPct !== null) {
          traderUpdates.profitable_months_pct = investor.profitableMonthsPct;
        }
        if (investor.dailyDD !== undefined && investor.dailyDD !== null) {
          traderUpdates.daily_drawdown = investor.dailyDD;
        }
        if (investor.weeklyDD !== undefined && investor.weeklyDD !== null) {
          traderUpdates.weekly_drawdown = investor.weeklyDD;
        }
        // Also capture additional useful metrics if available
        if (investor.maxDrawdown !== undefined && investor.maxDrawdown !== null) {
          traderUpdates.max_drawdown = investor.maxDrawdown;
        }
        if (investor.avgPosSize !== undefined && investor.avgPosSize !== null) {
          traderUpdates.avg_holding_time_days = investor.avgPosSize; // Approximate mapping
        }
        
        if (Object.keys(traderUpdates).length > 0) {
          console.log(`[sync-worker] Updating trader stats for ${trader.etoro_username}:`, traderUpdates);
          await supabase
            .from('traders')
            .update(traderUpdates)
            .eq('id', trader.id);
        }
      } else {
        console.log(`[sync-worker] Investor details fetch failed for ${trader.etoro_username}: ${investorRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch risk score from dedicated endpoint
      const riskRes = await fetch(
        ENDPOINTS.riskScore(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      let riskScoreValue: number | null = null;
      if (riskRes.ok) {
        const riskData = await riskRes.json();
        console.log(`[sync-worker] Risk score response for ${trader.etoro_username}:`, JSON.stringify(riskData, null, 2).slice(0, 500));
        
        // API returns { points: [{ date, riskScore, minRiskScore, maxRiskScore }, ...] }
        // Get the latest riskScore from the points array
        const points = riskData.points || riskData.data || [];
        if (Array.isArray(points) && points.length > 0) {
          // Get the last point (most recent)
          const latest = points[points.length - 1];
          riskScoreValue = latest.riskScore ?? latest.risk ?? latest.value ?? null;
        } else if (typeof riskData === 'number') {
          riskScoreValue = riskData;
        } else if (riskData.riskScore !== undefined) {
          riskScoreValue = riskData.riskScore;
        }
        
        if (riskScoreValue !== null) {
          console.log(`[sync-worker] Setting risk_score=${riskScoreValue} for ${trader.etoro_username}`);
          await supabase
            .from('traders')
            .update({ risk_score: riskScoreValue })
            .eq('id', trader.id);
        } else {
          console.log(`[sync-worker] Could not extract risk score for ${trader.etoro_username}`);
        }
      } else {
        console.log(`[sync-worker] Risk score fetch failed for ${trader.etoro_username}: ${riskRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch metrics (for advanced metrics like Sharpe, Sortino, Alpha, Beta, Volatility)
      const metricsRes = await fetch(
        ENDPOINTS.metrics(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        const metrics = metricsData.data || metricsData.metrics || metricsData;
        
        console.log(`[sync-worker] Got metrics for ${trader.etoro_username}:`, JSON.stringify(metrics, null, 2).slice(0, 500));
        
        // Update trader with advanced metrics
        const advancedMetrics: Record<string, unknown> = {};
        
        // Try various field names for each metric
        if (metrics.sharpeRatio !== undefined || metrics.sharpe !== undefined || metrics.sharpe_ratio !== undefined) {
          advancedMetrics.sharpe_ratio = metrics.sharpeRatio ?? metrics.sharpe ?? metrics.sharpe_ratio;
        }
        if (metrics.sortinoRatio !== undefined || metrics.sortino !== undefined || metrics.sortino_ratio !== undefined) {
          advancedMetrics.sortino_ratio = metrics.sortinoRatio ?? metrics.sortino ?? metrics.sortino_ratio;
        }
        // Map jensensAlpha to alpha
        if (metrics.jensensAlpha !== undefined || metrics.alpha !== undefined || metrics.jensenAlpha !== undefined) {
          advancedMetrics.alpha = metrics.jensensAlpha ?? metrics.alpha ?? metrics.jensenAlpha;
        }
        if (metrics.beta !== undefined) {
          advancedMetrics.beta = metrics.beta;
        }
        if (metrics.volatility !== undefined || metrics.stdDev !== undefined || metrics.standardDeviation !== undefined) {
          advancedMetrics.volatility = metrics.volatility ?? metrics.stdDev ?? metrics.standardDeviation;
        }
        if (metrics.dailyDrawdown !== undefined || metrics.dailyDD !== undefined || metrics.daily_drawdown !== undefined) {
          advancedMetrics.daily_drawdown = metrics.dailyDrawdown ?? metrics.dailyDD ?? metrics.daily_drawdown;
        }
        // Save additional ratios from Bullaware
        if (metrics.omegaRatio !== undefined || metrics.omega !== undefined) {
          advancedMetrics.omega_ratio = metrics.omegaRatio ?? metrics.omega;
        }
        if (metrics.treynorRatio !== undefined || metrics.treynor !== undefined) {
          advancedMetrics.treynor_ratio = metrics.treynorRatio ?? metrics.treynor;
        }
        if (metrics.calmarRatio !== undefined || metrics.calmar !== undefined) {
          advancedMetrics.calmar_ratio = metrics.calmarRatio ?? metrics.calmar;
        }
        if (metrics.informationRatio !== undefined || metrics.information !== undefined) {
          advancedMetrics.information_ratio = metrics.informationRatio ?? metrics.information;
        }
        
        if (Object.keys(advancedMetrics).length > 0) {
          console.log(`[sync-worker] Updating advanced metrics for ${trader.etoro_username}:`, advancedMetrics);
          await supabase
            .from('traders')
            .update(advancedMetrics)
            .eq('id', trader.id);
        }
      } else {
        console.log(`[sync-worker] Metrics fetch failed for ${trader.etoro_username}: ${metricsRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch equity/metrics history for performance vs benchmark chart
      const metricsHistoryRes = await fetch(
        ENDPOINTS.metricsHistory(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (metricsHistoryRes.ok) {
        const historyData = await metricsHistoryRes.json();
        const points = historyData.points || historyData.data || historyData.history || [];
        
        console.log(`[sync-worker] Got ${points.length} equity history points for ${trader.etoro_username}`);
        
        // Save equity history points (format: { date, equity, benchmark })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const point of (points as any[]).slice(-365)) { // Keep last 365 days
          const date = point.date || point.timestamp;
          const equity = point.equity ?? point.value ?? point.cumReturn ?? point.cumulativeReturn;
          const benchmark = point.benchmark ?? point.spx ?? point.sp500 ?? point.benchmarkReturn;
          
          if (date && equity !== undefined) {
            await supabase
              .from('trader_equity_history')
              .upsert({
                trader_id: trader.id,
                date: typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0],
                equity_value: equity,
                benchmark_value: benchmark,
              }, { onConflict: 'trader_id,date' });
          }
        }
      } else {
        console.log(`[sync-worker] Metrics history fetch failed for ${trader.etoro_username}: ${metricsHistoryRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch portfolio history for stacked area chart
      const portfolioHistoryRes = await fetch(
        ENDPOINTS.portfolioHistory(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (portfolioHistoryRes.ok) {
        const historyData = await portfolioHistoryRes.json();
        const snapshots = historyData.data || historyData.snapshots || historyData.history || [];
        
        console.log(`[sync-worker] Got ${snapshots.length} portfolio history snapshots for ${trader.etoro_username}`);
        
        // Save portfolio snapshots (format: { date, holdings: [{symbol, value}] })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const snapshot of (snapshots as any[]).slice(-52)) { // Keep last 52 weeks
          const date = snapshot.date || snapshot.timestamp;
          const holdings = snapshot.holdings || snapshot.positions || snapshot.portfolio || [];
          
          if (date && holdings.length > 0) {
            await supabase
              .from('trader_portfolio_history')
              .upsert({
                trader_id: trader.id,
                date: typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0],
                holdings: holdings,
              }, { onConflict: 'trader_id,date' });
          }
        }
      } else {
        console.log(`[sync-worker] Portfolio history fetch failed for ${trader.etoro_username}: ${portfolioHistoryRes.status}`);
      }

      // Update trader's details_synced_at (not updated_at which is for list sync)
      await supabase
        .from('traders')
        .update({ details_synced_at: new Date().toISOString() })
        .eq('id', trader.id);

      syncedTraders.push(trader.etoro_username);
      console.log(`[sync-worker] Completed sync for ${trader.etoro_username}`);

      // Rate limit between traders
      if (traders.indexOf(trader) < traders.length - 1) {
        await delay(RATE_LIMIT_DELAY_MS);
      }

    } catch (err) {
      console.error(`[sync-worker] Error syncing ${trader.etoro_username}:`, err);
    }
  }

  // Update sync state
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncAssetsBatch(
  supabase: any,
  apiKey: string
): Promise<{ synced: number }> {
  let totalSynced = 0;
  let page = 1;
  let hasMore = true;
  const pageSize = 50;

  while (hasMore) {
    console.log(`[sync-worker] Fetching assets page ${page} from ${ENDPOINTS.instruments}...`);

    const response = await fetch(
      `${ENDPOINTS.instruments}?page=${page}&limit=${pageSize}`,
      { 
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    if (!response.ok) {
      console.error(`[sync-worker] Assets API error: ${response.status}`);
      break;
    }

    const data = await response.json();
    const assets = data.items || data.data || data.instruments || [];

    if (assets.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`[sync-worker] Got ${assets.length} assets from page ${page}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assetsToUpsert = assets.map((a: any) => ({
      symbol: a.symbol || a.ticker || a.instrumentId,
      name: a.name || a.displayName || a.instrumentName || a.symbol,
      asset_type: a.type || a.asset_type || a.instrumentType || 'stock',
      logo_url: a.logoUrl || a.logo_url || a.image || a.icon,
      exchange: a.exchange || a.market,
      sector: a.sector,
      industry: a.industry,
      country: a.country || a.countryCode || a.region, // Add country for geographic diversification
      market_cap: a.marketCap ?? a.market_cap,
      pe_ratio: a.peRatio ?? a.pe_ratio ?? a.pe,
      eps: a.eps,
      dividend_yield: a.dividendYield ?? a.dividend_yield ?? a.dividend,
      beta: a.beta,
      high_52w: a.high52w ?? a.high_52w ?? a.yearHigh ?? a.week52High,
      low_52w: a.low52w ?? a.low_52w ?? a.yearLow ?? a.week52Low,
      avg_volume: a.avgVolume ?? a.avg_volume ?? a.averageVolume,
      current_price: a.currentPrice ?? a.current_price ?? a.price ?? a.lastPrice,
      price_change: a.priceChange ?? a.price_change ?? a.change,
      price_change_pct: a.priceChangePct ?? a.price_change_pct ?? a.changePercent,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('assets')
      .upsert(assetsToUpsert, { onConflict: 'symbol' });

    if (error) {
      console.error('[sync-worker] Error upserting assets:', error);
    } else {
      totalSynced += assetsToUpsert.length;
    }

    page++;
    hasMore = assets.length === pageSize;

    if (hasMore) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  // Update sync state
  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'assets', 
      last_run: new Date().toISOString(),
      status: 'idle',
      updated_at: new Date().toISOString()
    });

  console.log(`[sync-worker] Synced ${totalSynced} assets`);
  return { synced: totalSynced };
}
