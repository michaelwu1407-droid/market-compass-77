import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { yahooSymbolCandidates } from "../_shared/yahooSymbol.ts";
import { getYahooSession } from "../_shared/yahooSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface YahooChartResult {
  chart: {
    result: [{
      meta: {
        regularMarketPrice: number;
        previousClose: number;
        chartPreviousClose?: number;
        fiftyTwoWeekHigh: number;
        fiftyTwoWeekLow: number;
        currency: string;
        symbol: string;
      };
      timestamp: number[];
      indicators: {
        quote: [{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }];
      };
    }];
    error: null | { code: string; description: string };
  };
}

interface YahooQuoteResult {
  quoteSummary: {
    result: [{
      assetProfile?: {
        sector?: string;
        industry?: string;
      };
      summaryDetail?: {
        marketCap?: { raw: number };
        trailingPE?: { raw: number };
        forwardPE?: { raw: number };
        dividendYield?: { raw: number };
        averageVolume?: { raw: number };
        beta?: { raw: number };
        fiftyTwoWeekHigh?: { raw: number };
        fiftyTwoWeekLow?: { raw: number };
      };
      defaultKeyStatistics?: {
        trailingEps?: { raw: number };
        forwardEps?: { raw: number };
        beta?: { raw: number };
        enterpriseValue?: { raw: number };
      };
      price?: {
        regularMarketPrice?: { raw: number };
        regularMarketChange?: { raw: number };
        regularMarketChangePercent?: { raw: number };
        currency?: string;
        marketCap?: { raw: number };
      };
      financialData?: {
        currentPrice?: { raw: number };
      };
    }];
    error: null | { code: string; description: string };
  };
}

function normalizeDividendYieldToPct(raw: number | undefined | null): number | null {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  // Yahoo often returns yield as a fraction (e.g. 0.015 = 1.5%).
  if (value > 0 && value < 1) return value * 100;
  return value;
}

function safeNumber(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assetId, symbol, range } = await req.json();
    
    if (!assetId || !symbol) {
      return new Response(
        JSON.stringify({ error: 'Missing assetId or symbol' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[refresh-asset] Refreshing data for ${symbol} (${assetId})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Pull exchange/country/currency hints (if available) to build better Yahoo symbols.
    const { data: assetRow } = await supabase
      .from('assets')
      .select('symbol, exchange, country, currency, asset_type, sector')
      .eq('id', assetId)
      .maybeSingle();

    const symbolHint = {
      symbol: String(assetRow?.symbol || symbol),
      exchange: assetRow?.exchange ?? null,
      country: assetRow?.country ?? null,
      currency: assetRow?.currency ?? null,
      asset_type: assetRow?.asset_type ?? null,
      sector: assetRow?.sector ?? null,
    };

    const candidates = yahooSymbolCandidates(symbolHint);
    if (candidates.length === 0) {
      throw new Error('No symbol candidates available');
    }

    // Fetch chart data (historical prices + current price)
    const requestedRange = typeof range === 'string' && range.trim() ? range.trim() : '5y';
    let resolvedYahooSymbol: string | null = null;
    let result: YahooChartResult['chart']['result'][0] | null = null;
    let lastChartError: string | null = null;

    for (const candidate of candidates) {
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}?interval=1d&range=${encodeURIComponent(requestedRange)}`;
      console.log(`[refresh-asset] Fetching chart from: ${chartUrl}`);

      const chartResponse = await fetch(chartUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
        },
      });

      if (!chartResponse.ok) {
        lastChartError = `HTTP ${chartResponse.status}`;
        continue;
      }

      const chartData: YahooChartResult = await chartResponse.json();
      if (chartData.chart.error) {
        lastChartError = chartData.chart.error.description;
        continue;
      }

      const r = chartData.chart.result?.[0];
      if (!r || !Array.isArray(r.timestamp) || r.timestamp.length === 0) {
        lastChartError = 'No chart data returned';
        continue;
      }

      resolvedYahooSymbol = candidate;
      result = r;
      break;
    }

    if (!resolvedYahooSymbol || !result) {
      throw new Error(`Yahoo chart lookup failed for ${symbolHint.symbol} (tried: ${candidates.join(', ')}): ${lastChartError || 'unknown error'}`);
    }

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};

    // Extract currency from chart meta
    const currency = meta.currency || 'USD';
    
    console.log(`[refresh-asset] Got ${timestamps.length} price points for ${resolvedYahooSymbol} (stored symbol=${symbolHint.symbol})`);
    console.log(`[refresh-asset] Currency: ${currency}, Current price: ${meta.regularMarketPrice}, Previous close: ${meta.previousClose}`);

    // Calculate price change
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const priceChange = currentPrice - previousClose;
    const priceChangePct = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;

    // Fetch fundamentals via Yahoo quoteSummary JSON (works without Firecrawl).
    // NOTE: This endpoint may occasionally be rate-limited; treat as best-effort.
    let fundamentals: Record<string, any> = {};
    try {
      const session = await getYahooSession();
      const crumbParam = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
      const quoteUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(resolvedYahooSymbol)}?modules=assetProfile,summaryDetail,defaultKeyStatistics,price${crumbParam}`;
      console.log(`[refresh-asset] Fetching quoteSummary from: ${quoteUrl}`);

      const quoteResp = await fetch(quoteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(session?.cookie ? { 'Cookie': session.cookie } : {}),
        },
      });

      if (quoteResp.ok) {
        const quoteData: YahooQuoteResult = await quoteResp.json();
        if (quoteData.quoteSummary?.error) {
          console.warn('[refresh-asset] quoteSummary error:', quoteData.quoteSummary.error);
        } else {
          const qs = quoteData.quoteSummary?.result?.[0];
          if (qs) {
            fundamentals = {
              sector: qs.assetProfile?.sector ?? null,
              industry: qs.assetProfile?.industry ?? null,
              market_cap: safeNumber(qs.price?.marketCap?.raw ?? qs.summaryDetail?.marketCap?.raw),
              pe_ratio: safeNumber(qs.summaryDetail?.trailingPE?.raw),
              eps: safeNumber(qs.defaultKeyStatistics?.trailingEps?.raw),
              dividend_yield: normalizeDividendYieldToPct(qs.summaryDetail?.dividendYield?.raw),
              beta: safeNumber(qs.summaryDetail?.beta?.raw ?? qs.defaultKeyStatistics?.beta?.raw),
              avg_volume: safeNumber(qs.summaryDetail?.averageVolume?.raw),
              currency: (qs.price?.currency ?? currency) || currency,
              high_52w: safeNumber(qs.summaryDetail?.fiftyTwoWeekHigh?.raw),
              low_52w: safeNumber(qs.summaryDetail?.fiftyTwoWeekLow?.raw),
            };
          }
        }
      } else {
        console.warn(`[refresh-asset] quoteSummary HTTP ${quoteResp.status}: ${await quoteResp.text()}`);
      }
    } catch (e) {
      console.warn('[refresh-asset] quoteSummary fetch failed:', e);
    }

    // Update asset with latest data including currency
    const assetUpdate = {
      current_price: currentPrice,
      price_change: priceChange,
      price_change_pct: priceChangePct,
      high_52w: meta.fiftyTwoWeekHigh || null,
      low_52w: meta.fiftyTwoWeekLow || null,
      currency: currency,
      // Prefer quoteSummary fundamentals when present.
      ...(fundamentals.market_cap !== null && fundamentals.market_cap !== undefined ? { market_cap: fundamentals.market_cap } : {}),
      ...(fundamentals.pe_ratio !== null && fundamentals.pe_ratio !== undefined ? { pe_ratio: fundamentals.pe_ratio } : {}),
      ...(fundamentals.eps !== null && fundamentals.eps !== undefined ? { eps: fundamentals.eps } : {}),
      ...(fundamentals.dividend_yield !== null && fundamentals.dividend_yield !== undefined ? { dividend_yield: fundamentals.dividend_yield } : {}),
      ...(fundamentals.beta !== null && fundamentals.beta !== undefined ? { beta: fundamentals.beta } : {}),
      ...(fundamentals.avg_volume !== null && fundamentals.avg_volume !== undefined ? { avg_volume: fundamentals.avg_volume } : {}),
      ...(fundamentals.currency ? { currency: fundamentals.currency } : {}),
      ...(fundamentals.high_52w !== null && fundamentals.high_52w !== undefined ? { high_52w: fundamentals.high_52w } : {}),
      ...(fundamentals.low_52w !== null && fundamentals.low_52w !== undefined ? { low_52w: fundamentals.low_52w } : {}),
      ...(fundamentals.sector ? { sector: fundamentals.sector } : {}),
      ...(fundamentals.industry ? { industry: fundamentals.industry } : {}),
      price_history_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log(`[refresh-asset] Updating asset:`, JSON.stringify(assetUpdate));

    const { error: assetError } = await supabase
      .from('assets')
      .update(assetUpdate)
      .eq('id', assetId);

    if (assetError) {
      const msg = (assetError as any)?.message || JSON.stringify(assetError);
      console.error(`[refresh-asset] Failed to update asset:`, assetError);

      // Backwards-compatible fallback: if the DB migration hasn't been applied yet,
      // retry without the new marker column so refresh still works.
      if (typeof msg === 'string' && msg.includes('price_history_synced_at')) {
        const { price_history_synced_at: _ignored, ...assetUpdateWithoutMarker } = assetUpdate as any;
        const { error: retryError } = await supabase
          .from('assets')
          .update(assetUpdateWithoutMarker)
          .eq('id', assetId);
        if (retryError) {
          console.error(`[refresh-asset] Retry without marker failed:`, retryError);
          throw retryError;
        }
      } else {
        throw assetError;
      }
    }

    // Store price history
    const q: any = quotes as any;
    const priceHistory = timestamps.map((ts: number, i: number) => ({
      asset_id: assetId,
      date: new Date(ts * 1000).toISOString().split('T')[0],
      open_price: q.open?.[i] || null,
      high_price: q.high?.[i] || null,
      low_price: q.low?.[i] || null,
      close_price: q.close?.[i] || null,
      volume: q.volume?.[i] || null,
    })).filter((p: any) => p.close_price !== null);

    console.log(`[refresh-asset] Storing ${priceHistory.length} price history records`);

    // Upsert price history by (asset_id, date)
    if (priceHistory.length > 0) {
      const { error: historyError } = await supabase
        .from('price_history')
        .upsert(priceHistory, { onConflict: 'asset_id,date' });

      if (historyError) {
        console.error(`[refresh-asset] Failed to insert price history:`, historyError);
        // Don't throw - we still updated the asset
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        priceHistoryCount: priceHistory.length,
        currentPrice,
        currency,
        priceChange,
        priceChangePct,
        fundamentals
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[refresh-asset] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
