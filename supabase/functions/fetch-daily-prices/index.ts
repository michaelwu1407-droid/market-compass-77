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
  
  // Yahoo Finance allows batch quotes
  const symbolsParam = symbols.join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`[fetch-daily-prices] Yahoo API error: ${response.status}`);
      return results;
    }
    
    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];
    
    for (const quote of quotes) {
      if (quote.symbol) {
        results.set(quote.symbol.toUpperCase(), {
          symbol: quote.symbol,
          regularMarketPrice: quote.regularMarketPrice,
          regularMarketChange: quote.regularMarketChange,
          regularMarketChangePercent: quote.regularMarketChangePercent,
          regularMarketPreviousClose: quote.regularMarketPreviousClose,
        });
      }
    }
  } catch (error) {
    console.error('[fetch-daily-prices] Error fetching Yahoo quotes:', error);
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

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

    // Process in batches of 20 (Yahoo Finance limit)
    const batchSize = 20;
    let totalUpdated = 0;
    let totalFailed = 0;

    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const symbols = batch.map(a => a.symbol);
      
      console.log(`[fetch-daily-prices] Processing batch ${Math.floor(i / batchSize) + 1}: ${symbols.join(', ')}`);
      
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
      
      // Rate limiting - wait between batches
      if (i + batchSize < assets.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
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
