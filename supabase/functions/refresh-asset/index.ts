import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      summaryDetail?: {
        marketCap?: { raw: number };
        trailingPE?: { raw: number };
        dividendYield?: { raw: number };
        averageVolume?: { raw: number };
        beta?: { raw: number };
        fiftyTwoWeekHigh?: { raw: number };
        fiftyTwoWeekLow?: { raw: number };
      };
      defaultKeyStatistics?: {
        trailingEps?: { raw: number };
        beta?: { raw: number };
      };
      price?: {
        regularMarketPrice?: { raw: number };
        regularMarketChange?: { raw: number };
        regularMarketChangePercent?: { raw: number };
      };
    }];
    error: null | { code: string; description: string };
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assetId, symbol } = await req.json();
    
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

    // Fetch chart data (historical prices + current price)
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
    console.log(`[refresh-asset] Fetching chart from: ${chartUrl}`);
    
    const chartResponse = await fetch(chartUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!chartResponse.ok) {
      console.error(`[refresh-asset] Chart API error: ${chartResponse.status}`);
      throw new Error(`Yahoo Finance API returned ${chartResponse.status}`);
    }

    const chartData: YahooChartResult = await chartResponse.json();
    
    if (chartData.chart.error) {
      console.error(`[refresh-asset] Chart API error:`, chartData.chart.error);
      throw new Error(chartData.chart.error.description);
    }

    const result = chartData.chart.result?.[0];
    if (!result) {
      throw new Error('No chart data returned');
    }

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};

    console.log(`[refresh-asset] Got ${timestamps.length} price points for ${symbol}`);
    console.log(`[refresh-asset] Current price: ${meta.regularMarketPrice}, Previous close: ${meta.previousClose}`);

    // Calculate price change
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose;
    const priceChange = currentPrice - previousClose;
    const priceChangePct = (priceChange / previousClose) * 100;

    // Fetch fundamental data
    let fundamentals: any = {};
    try {
      const quoteUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,price`;
      console.log(`[refresh-asset] Fetching fundamentals from: ${quoteUrl}`);
      
      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (quoteResponse.ok) {
        const quoteData: YahooQuoteResult = await quoteResponse.json();
        const summary = quoteData.quoteSummary?.result?.[0]?.summaryDetail;
        const keyStats = quoteData.quoteSummary?.result?.[0]?.defaultKeyStatistics;
        
        fundamentals = {
          market_cap: summary?.marketCap?.raw || null,
          pe_ratio: summary?.trailingPE?.raw || null,
          dividend_yield: summary?.dividendYield?.raw ? summary.dividendYield.raw * 100 : null,
          avg_volume: summary?.averageVolume?.raw || null,
          beta: summary?.beta?.raw || keyStats?.beta?.raw || null,
          eps: keyStats?.trailingEps?.raw || null,
        };
        console.log(`[refresh-asset] Got fundamentals:`, fundamentals);
      }
    } catch (err) {
      console.warn(`[refresh-asset] Failed to fetch fundamentals:`, err);
    }

    // Update asset with latest data
    const assetUpdate = {
      current_price: currentPrice,
      price_change: priceChange,
      price_change_pct: priceChangePct,
      high_52w: meta.fiftyTwoWeekHigh || null,
      low_52w: meta.fiftyTwoWeekLow || null,
      ...fundamentals,
      updated_at: new Date().toISOString(),
    };

    console.log(`[refresh-asset] Updating asset:`, assetUpdate);

    const { error: assetError } = await supabase
      .from('assets')
      .update(assetUpdate)
      .eq('id', assetId);

    if (assetError) {
      console.error(`[refresh-asset] Failed to update asset:`, assetError);
      throw assetError;
    }

    // Store price history
    const priceHistory = timestamps.map((ts: number, i: number) => ({
      asset_id: assetId,
      date: new Date(ts * 1000).toISOString().split('T')[0],
      open_price: quotes.open?.[i] || null,
      high_price: quotes.high?.[i] || null,
      low_price: quotes.low?.[i] || null,
      close_price: quotes.close?.[i] || null,
      volume: quotes.volume?.[i] || null,
    })).filter((p: any) => p.close_price !== null);

    console.log(`[refresh-asset] Storing ${priceHistory.length} price history records`);

    // Delete existing price history for this asset
    await supabase
      .from('price_history')
      .delete()
      .eq('asset_id', assetId);

    // Insert new price history
    if (priceHistory.length > 0) {
      const { error: historyError } = await supabase
        .from('price_history')
        .insert(priceHistory);

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
        priceChange,
        priceChangePct
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
