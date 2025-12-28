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

    // Extract currency from chart meta
    const currency = meta.currency || 'USD';
    
    console.log(`[refresh-asset] Got ${timestamps.length} price points for ${symbol}`);
    console.log(`[refresh-asset] Currency: ${currency}, Current price: ${meta.regularMarketPrice}, Previous close: ${meta.previousClose}`);

    // Calculate price change
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const priceChange = currentPrice - previousClose;
    const priceChangePct = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;

    // Fetch fundamental data using Firecrawl to scrape Yahoo Finance
    let fundamentals: any = {};
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (firecrawlApiKey) {
      try {
        const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
        console.log(`[refresh-asset] Scraping fundamentals from: ${yahooUrl}`);
        
        const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: yahooUrl,
            formats: ['markdown'],
            waitFor: 3000, // Wait for JS to render
          }),
        });
        
        if (firecrawlResponse.ok) {
          const firecrawlData = await firecrawlResponse.json();
          const markdown = firecrawlData.data?.markdown || '';
          
          console.log(`[refresh-asset] Got ${markdown.length} chars of markdown`);
          
          // Parse key metrics from markdown
          // Format is usually like: "Market Cap | 25.33B" or "Market Cap25.33B"
          const parseMetric = (pattern: RegExp): number | null => {
            const match = markdown.match(pattern);
            if (!match) return null;
            
            const valueStr = match[1].replace(/[,\s]/g, '').trim();
            if (valueStr === '--' || valueStr === 'N/A' || valueStr === '') return null;
            
            const multipliers: Record<string, number> = { 'T': 1e12, 'B': 1e9, 'M': 1e6, 'K': 1e3 };
            const numMatch = valueStr.match(/^([\d.]+)([TBMK])?$/i);
            if (numMatch) {
              const num = parseFloat(numMatch[1]);
              const mult = numMatch[2] ? multipliers[numMatch[2].toUpperCase()] || 1 : 1;
              return num * mult;
            }
            const parsed = parseFloat(valueStr);
            return isNaN(parsed) ? null : parsed;
          };
          
          // Different possible patterns for the metrics
          const marketCap = parseMetric(/Market\s*Cap[^\d]*?([\d,.]+[TBMK]?)/i);
          const peRatio = parseMetric(/(?:PE\s*Ratio|P\/E)[^\d]*?([\d,.]+)/i);
          const eps = parseMetric(/EPS[^\d]*?([\d,.]+)/i);
          const dividendYield = parseMetric(/Dividend\s*Yield[^\d]*?([\d,.]+)%?/i);
          const beta = parseMetric(/Beta[^\d]*?([\d,.]+)/i);
          
          fundamentals = {
            market_cap: marketCap,
            pe_ratio: peRatio,
            eps: eps,
            dividend_yield: dividendYield,
            beta: beta,
          };
          
          console.log(`[refresh-asset] Parsed fundamentals:`, JSON.stringify(fundamentals));
        } else {
          const errorText = await firecrawlResponse.text();
          console.warn(`[refresh-asset] Firecrawl returned ${firecrawlResponse.status}: ${errorText}`);
        }
      } catch (err) {
        console.warn(`[refresh-asset] Firecrawl scrape failed:`, err);
      }
    } else {
      console.warn(`[refresh-asset] FIRECRAWL_API_KEY not configured, skipping fundamentals`);
    }

    // Update asset with latest data including currency
    const assetUpdate = {
      current_price: currentPrice,
      price_change: priceChange,
      price_change_pct: priceChangePct,
      high_52w: meta.fiftyTwoWeekHigh || null,
      low_52w: meta.fiftyTwoWeekLow || null,
      currency: currency,
      ...fundamentals,
      updated_at: new Date().toISOString(),
    };

    console.log(`[refresh-asset] Updating asset:`, JSON.stringify(assetUpdate));

    const { error: assetError } = await supabase
      .from('assets')
      .update(assetUpdate)
      .eq('id', assetId);

    if (assetError) {
      console.error(`[refresh-asset] Failed to update asset:`, assetError);
      throw assetError;
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
