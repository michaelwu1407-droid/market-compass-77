import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface YahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
}

async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const results = new Map<string, YahooQuote>();

  if (symbols.length === 0) {
    return results;
  }

  // Use Yahoo Finance v7 quote endpoint which supports batching and doesn't require authentication.
  // This is dramatically faster than per-symbol v8 chart calls and helps stay within edge runtime limits.
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbols.join(","),
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.log(
        `[fetch-daily-prices] Yahoo API error (batch): ${response.status}`,
      );
      return results;
    }

    const data = await response.json();
    const quotes: Array<Record<string, unknown>> =
      data?.quoteResponse?.result ?? [];

    for (const quote of quotes) {
      const symbol = String(quote.symbol ?? "");
      if (!symbol) continue;

      const currentPrice = Number(quote.regularMarketPrice);
      const previousClose = Number(quote.regularMarketPreviousClose);

      if (!Number.isFinite(currentPrice) || !Number.isFinite(previousClose)) {
        continue;
      }

      if (previousClose <= 0) {
        continue;
      }

      const priceChange = currentPrice - previousClose;
      const priceChangePercent = (priceChange / previousClose) * 100;

      results.set(symbol.toUpperCase(), {
        symbol,
        regularMarketPrice: currentPrice,
        regularMarketChange: priceChange,
        regularMarketChangePercent: priceChangePercent,
        regularMarketPreviousClose: previousClose,
      });
    }

    return results;
  } catch (error) {
    console.log(`[fetch-daily-prices] Error fetching quotes (batch):`, error);
    return results;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('[fetch-daily-prices] Starting daily price fetch...');

    // Get all assets
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, symbol, name')
      .order('symbol');

    if (assetsError) {
      console.error('[fetch-daily-prices] Error fetching assets:', assetsError);
      throw assetsError;
    }

    if (!assets || assets.length === 0) {
      console.log('[fetch-daily-prices] No assets found');
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: 'No assets to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[fetch-daily-prices] Found ${assets.length} assets to update`);

    // Batch quotes to reduce Yahoo calls and stay within edge runtime limits
    const batchSize = 25;
    let totalUpdated = 0;
    let totalFailed = 0;

    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const symbols = batch.map(a => a.symbol);
      
      console.log(`[fetch-daily-prices] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(assets.length / batchSize)}: ${symbols.join(', ')}`);
      
      const quotes = await fetchYahooQuotes(symbols);
      
      for (const asset of batch) {
        const quote = quotes.get(asset.symbol.toUpperCase());
        
        if (quote && quote.regularMarketPrice !== undefined) {
          const { error: updateError } = await supabase
            .from('assets')
            .update({
              current_price: quote.regularMarketPrice,
              price_change: quote.regularMarketChange || 0,
              price_change_pct: quote.regularMarketChangePercent || 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', asset.id);

          if (updateError) {
            console.error(`[fetch-daily-prices] Error updating ${asset.symbol}:`, updateError);
            totalFailed++;
          } else {
            console.log(`[fetch-daily-prices] Updated ${asset.symbol}: $${quote.regularMarketPrice} (${quote.regularMarketChangePercent?.toFixed(2)}%)`);
            totalUpdated++;
          }
        } else {
          console.log(`[fetch-daily-prices] No quote data for ${asset.symbol}`);
          totalFailed++;
        }
      }
      
      // Light rate limiting - wait between batches
      if (i + batchSize < assets.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(`[fetch-daily-prices] Completed: ${totalUpdated} updated, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: totalUpdated,
        failed: totalFailed,
        total: assets.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fetch-daily-prices] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
