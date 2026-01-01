import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { yahooSymbolCandidates, type YahooSymbolHint } from '../_shared/yahooSymbol.ts';
import { getYahooSession } from '../_shared/yahooSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const DELAY_MS = 500;
const UNKNOWN_RETRY_DAYS = 7;

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function missingColumnNameFromError(error: unknown): string | null {
  const msg = (error as any)?.message || (error as any)?.details || String(error || '');
  if (typeof msg !== 'string') return null;
  // Examples:
  // - column assets.avg_volume does not exist
  // - column "avg_volume" does not exist
  const m = msg.match(/column\s+(?:[\w\."]+\.)?"?([a-zA-Z0-9_]+)"?\s+does\s+not\s+exist/i);
  return m?.[1] ?? null;
}

async function updateWithColumnFallback(
  supabase: any,
  table: string,
  update: Record<string, any>,
  where: { column: string; value: any },
): Promise<{ attempted: string[]; removed: string[]; error: any | null }> {
  const attempted = Object.keys(update);
  const removed: string[] = [];

  let current = { ...update };
  for (let i = 0; i < 5; i++) {
    const { error } = await supabase.from(table).update(current).eq(where.column, where.value);
    if (!error) return { attempted, removed, error: null };

    const missing = missingColumnNameFromError(error);
    if (!missing || !(missing in current)) {
      return { attempted, removed, error };
    }

    delete current[missing];
    removed.push(missing);
    if (Object.keys(current).length === 0) {
      return { attempted, removed, error: null };
    }
  }

  return { attempted, removed, error: null };
}

type AssetHint = YahooSymbolHint & {
  id?: string;
  name?: string | null;
};

function isCrypto(symbol: string, assetType: string | null): boolean {
  const cryptoSymbols = ['BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'SHIB', 'LTC', 'UNI', 'ATOM', 'XLM'];
  const upperSymbol = symbol.toUpperCase();
  return assetType?.toLowerCase() === 'crypto' || 
         assetType?.toLowerCase() === 'cryptocurrency' ||
         cryptoSymbols.some(c => upperSymbol.includes(c));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchYahooSectorData(asset: AssetHint): Promise<{ sector: string | null; industry: string | null }> {
  const candidates = yahooSymbolCandidates(asset);
  const session = await getYahooSession();
  const crumbParam = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';

  for (const yahooSymbol of candidates) {
    // Prefer quoteSummary JSON (more stable than scraping HTML).
    const quoteUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile${crumbParam}`;
    const profileUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}/profile`;

    try {
      const quoteResp = await fetch(quoteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(session?.cookie ? { 'Cookie': session.cookie } : {}),
        },
      });

      if (quoteResp.ok) {
        const quoteData = await quoteResp.json();
        const profile = quoteData?.quoteSummary?.result?.[0]?.assetProfile;
        const sector = profile?.sector ?? null;
        const industry = profile?.industry ?? null;
        if (sector || industry) {
          console.log(`[enrich-assets-yahoo] ${asset.symbol} (${yahooSymbol}) -> sector: ${sector}, industry: ${industry} (quoteSummary)`);
          return { sector, industry };
        }
      }

      const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      });

      if (!response.ok) {
        // Try next candidate.
        continue;
      }

      const html = await response.text();
    
    // Parse sector and industry from HTML
    // Look for patterns like "Sector" followed by the sector name
    let sector: string | null = null;
    let industry: string | null = null;

    // Pattern 1: Look for sector in JSON data embedded in page
    const sectorMatch = html.match(/"sector"\s*:\s*"([^"]+)"/i);
    if (sectorMatch) {
      sector = sectorMatch[1];
    }

    const industryMatch = html.match(/"industry"\s*:\s*"([^"]+)"/i);
    if (industryMatch) {
      industry = industryMatch[1];
    }

    // Pattern 2: Look for sector in visible HTML
    if (!sector) {
      const sectorHtmlMatch = html.match(/Sector[^<]*<[^>]*>([^<]+)</i);
      if (sectorHtmlMatch) {
        sector = sectorHtmlMatch[1].trim();
      }
    }

    if (!industry) {
      const industryHtmlMatch = html.match(/Industry[^<]*<[^>]*>([^<]+)</i);
      if (industryHtmlMatch) {
        industry = industryHtmlMatch[1].trim();
      }
    }

    // Pattern 3: Look for data in script tags with JSON
    if (!sector) {
      const jsonMatch = html.match(/root\.App\.main\s*=\s*(\{[\s\S]*?\});/);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          const profile = jsonData?.context?.dispatcher?.stores?.QuoteSummaryStore?.assetProfile;
          if (profile) {
            sector = profile.sector || null;
            industry = profile.industry || null;
          }
        } catch {
          // JSON parsing failed, continue
        }
      }
    }

      console.log(`[enrich-assets-yahoo] ${asset.symbol} (${yahooSymbol}) -> sector: ${sector}, industry: ${industry}`);
      if (sector || industry) {
        return { sector, industry };
      }
    } catch (error) {
      // Try next candidate.
      console.warn(`[enrich-assets-yahoo] Error fetching ${asset.symbol} (${yahooSymbol}):`, error);
    }
  }

  return { sector: null, industry: null };
}

function safeNumber(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normalizeDividendYieldToPct(raw: unknown): number | null {
  const value = safeNumber(raw);
  if (value === null) return null;
  if (value > 0 && value < 1) return value * 100;
  return value;
}

async function fetchYahooFundamentals(asset: AssetHint): Promise<{
  currency: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;
  beta: number | null;
  avg_volume: number | null;
  sector: string | null;
  industry: string | null;
}> {
  const candidates = yahooSymbolCandidates(asset);
  const session = await getYahooSession();
  const crumbParam = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
  for (const yahooSymbol of candidates) {
    const quoteUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile,summaryDetail,defaultKeyStatistics,price${crumbParam}`;
    try {
      const resp = await fetch(quoteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(session?.cookie ? { 'Cookie': session.cookie } : {}),
        },
      });
      if (!resp.ok) {
        continue;
      }

      const data = await resp.json();
      const qs = data?.quoteSummary?.result?.[0];
      if (!qs) continue;

      return {
        currency: qs?.price?.currency ?? null,
        market_cap: safeNumber(qs?.price?.marketCap?.raw ?? qs?.summaryDetail?.marketCap?.raw),
        pe_ratio: safeNumber(qs?.summaryDetail?.trailingPE?.raw),
        eps: safeNumber(qs?.defaultKeyStatistics?.trailingEps?.raw),
        dividend_yield: normalizeDividendYieldToPct(qs?.summaryDetail?.dividendYield?.raw),
        beta: safeNumber(qs?.summaryDetail?.beta?.raw ?? qs?.defaultKeyStatistics?.beta?.raw),
        avg_volume: safeNumber(qs?.summaryDetail?.averageVolume?.raw),
        sector: qs?.assetProfile?.sector ?? null,
        industry: qs?.assetProfile?.industry ?? null,
      };
    } catch (e) {
      console.warn('[enrich-assets-yahoo] Failed to fetch quoteSummary fundamentals:', e);
    }
  }

  return {
    currency: null,
    market_cap: null,
    pe_ratio: null,
    eps: null,
    dividend_yield: null,
    beta: null,
    avg_volume: null,
    sector: null,
    industry: null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[enrich-assets-yahoo] Starting sector enrichment...');

    const url = new URL(req.url);

    // Optional: allow targeted enrichment by symbol(s) for debugging/backfills.
    // When provided, we will enrich those assets regardless of missing-field filters.
    let symbols: string[] = [];
    let limit = clampInt(url.searchParams.get('limit'), 1, BATCH_SIZE, BATCH_SIZE);
    let delayMs = clampInt(url.searchParams.get('delay_ms'), 0, 5000, DELAY_MS);
    try {
      const body = await req.json();
      if (Array.isArray(body?.symbols)) {
        symbols = body.symbols
          .map((s: unknown) => String(s || '').trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 50);
      }

      if (body && typeof body === 'object') {
        limit = clampInt((body as any)?.limit ?? limit, 1, BATCH_SIZE, limit);
        delayMs = clampInt((body as any)?.delay_ms ?? delayMs, 0, 5000, delayMs);
      }
    } catch {
      // No JSON body provided.
    }

    // Get assets missing sector data, or previously marked Unknown (retry after cooldown),
    // or missing key fundamentals.
    const unknownCutoffIso = new Date(Date.now() - UNKNOWN_RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const fullSelect = 'id, symbol, name, asset_type, exchange, country, sector, industry, currency, market_cap, pe_ratio, eps, dividend_yield, avg_volume, beta, updated_at';
    const minimalSelect = 'id, symbol, name, asset_type, exchange, country, sector, updated_at';

    const tryFetchAssets = async (selectCols: string, includeFundamentalFilters: boolean) => {
      const query = supabase.from('assets').select(selectCols);

      if (symbols.length > 0) {
        return await query.in('symbol', symbols).limit(limit);
      }

      const sectorOnlyOr =
        `sector.is.null,` +
        `and(sector.eq.Unknown,or(updated_at.is.null,updated_at.lt.${unknownCutoffIso}))`;
      const fullOr =
        sectorOnlyOr +
        `,market_cap.is.null,pe_ratio.is.null,eps.is.null,dividend_yield.is.null,avg_volume.is.null,beta.is.null,currency.is.null`;

      return await query
        .or(includeFundamentalFilters ? fullOr : sectorOnlyOr)
        .limit(limit);
    };

    let assets: any[] | null = null;
    let fetchError: any | null = null;

    // 1) Try full select + full filters
    {
      const r = await tryFetchAssets(fullSelect, true);
      assets = r.data;
      fetchError = r.error;
    }

    // 2) If schema drift (missing columns) breaks the filter, retry with sector-only filter
    if (fetchError) {
      const r = await tryFetchAssets(fullSelect, false);
      assets = r.data;
      fetchError = r.error;
    }

    // 3) If schema drift breaks select list, retry with minimal columns
    if (fetchError) {
      const r = await tryFetchAssets(minimalSelect, false);
      assets = r.data;
      fetchError = r.error;
    }

    if (fetchError) throw fetchError;

    if (!assets || assets.length === 0) {
      console.log('[enrich-assets-yahoo] All assets already have sector data');
      return new Response(JSON.stringify({
        success: true,
        message: 'All assets already enriched',
        enriched: 0,
        remaining: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[enrich-assets-yahoo] Processing ${assets.length} assets (limit=${limit}, delay_ms=${delayMs})...`);

    let enrichedCount = 0;
    let skippedCount = 0;

    let perAssetErrors = 0;

    for (const asset of assets) {
      try {
      // Handle crypto assets
      if (isCrypto(asset.symbol, asset.asset_type)) {
        const nowIso = new Date().toISOString();
        await updateWithColumnFallback(
          supabase,
          'assets',
          {
            sector: 'Cryptocurrency',
            industry: 'Digital Assets',
            updated_at: nowIso,
          },
          { column: 'id', value: asset.id },
        );
        
        console.log(`[enrich-assets-yahoo] ${asset.symbol} -> Cryptocurrency (auto-detected)`);
        enrichedCount++;
        continue;
      }

      // Fetch from Yahoo Finance
      const fundamentals = await fetchYahooFundamentals({
        symbol: asset.symbol,
        exchange: asset.exchange ?? null,
        country: asset.country ?? null,
        currency: asset.currency ?? null,
        asset_type: asset.asset_type ?? null,
        sector: asset.sector ?? null,
      });
      const sector = fundamentals.sector;
      const industry = fundamentals.industry;

      const update: Record<string, any> = { updated_at: new Date().toISOString() };

      // Only fill missing fields; do not overwrite existing values.
      const sectorMissing = !asset.sector || asset.sector === 'Unknown';
      const industryMissing = !asset.industry || asset.industry === 'Unknown';
      if (sectorMissing && sector) update.sector = sector;
      if (industryMissing && industry) update.industry = industry;
      if (!asset.currency && fundamentals.currency) update.currency = fundamentals.currency;
      if (!asset.market_cap && fundamentals.market_cap !== null) update.market_cap = fundamentals.market_cap;
      if (!asset.pe_ratio && fundamentals.pe_ratio !== null) update.pe_ratio = fundamentals.pe_ratio;
      if (!asset.eps && fundamentals.eps !== null) update.eps = fundamentals.eps;
      if (!asset.dividend_yield && fundamentals.dividend_yield !== null) update.dividend_yield = fundamentals.dividend_yield;
      if (!asset.avg_volume && fundamentals.avg_volume !== null) update.avg_volume = fundamentals.avg_volume;
      if (!asset.beta && fundamentals.beta !== null) update.beta = fundamentals.beta;

      if (Object.keys(update).length > 1) {
        const res = await updateWithColumnFallback(
          supabase,
          'assets',
          update,
          { column: 'id', value: asset.id },
        );
        if (res.error) {
          console.warn(`[enrich-assets-yahoo] update failed for ${asset.symbol}:`, res.error);
          perAssetErrors++;
        }
      }

      if (sector) {
        enrichedCount++;
      } else if (!asset.sector) {
        // Mark as Unknown when sector is still missing, but allow retry later via cooldown.
        const nowIso = new Date().toISOString();
        const res = await updateWithColumnFallback(
          supabase,
          'assets',
          {
            sector: 'Unknown',
            updated_at: nowIso,
          },
          { column: 'id', value: asset.id },
        );
        if (res.error) {
          console.warn(`[enrich-assets-yahoo] failed to mark Unknown for ${asset.symbol}:`, res.error);
          perAssetErrors++;
        }
        skippedCount++;
      }

      // Rate limiting
      await delay(delayMs);
      } catch (e) {
        perAssetErrors++;
        console.warn(`[enrich-assets-yahoo] per-asset error for ${asset?.symbol || 'unknown'}:`, e);
        await delay(delayMs);
      }
    }

    // Count remaining assets without sector
    const { count: remaining } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .is('sector', null);

    console.log(`[enrich-assets-yahoo] Completed: ${enrichedCount} enriched, ${skippedCount} skipped, ${remaining || 0} remaining`);

    return new Response(JSON.stringify({
      success: true,
      enriched: enrichedCount,
      skipped: skippedCount,
      remaining: remaining || 0,
      per_asset_errors: perAssetErrors,
      message: remaining && remaining > 0 
        ? `Run again to process ${remaining} more assets`
        : 'All assets enriched',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[enrich-assets-yahoo] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
