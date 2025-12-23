import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DailyMover {
  symbol: string;
  name?: string;
  change_pct: number;
  direction: 'up' | 'down';
  volume?: number;
}

async function scrapeEtoroDiscover(firecrawlApiKey: string): Promise<DailyMover[]> {
  try {
    // Scrape eToro discover/markets page for trending assets
    const url = 'https://www.etoro.com/discover/markets/stocks';
    console.log(`Scraping eToro discover: ${url}`);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.error(`Firecrawl error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';

    const movers: DailyMover[] = [];
    const lines = markdown.split('\n');

    for (const line of lines) {
      // Look for patterns like "AAPL Apple Inc +2.5%" or "TSLA -3.2%"
      const match = line.match(/([A-Z]{1,5})\s*(?:[A-Za-z\s.]+)?\s*([-+]?\d+(?:\.\d+)?)\s*%/);
      if (match) {
        const symbol = match[1];
        const changePct = parseFloat(match[2]);
        
        // Avoid duplicates
        if (!movers.find(m => m.symbol === symbol)) {
          movers.push({
            symbol,
            change_pct: Math.abs(changePct),
            direction: changePct >= 0 ? 'up' : 'down',
          });
        }
      }
    }

    // Also try to scrape specific gainers/losers pages
    const gainersUrl = 'https://www.etoro.com/discover/markets/stocks?sort=change&sortDirection=desc';
    const losersUrl = 'https://www.etoro.com/discover/markets/stocks?sort=change&sortDirection=asc';

    for (const pageUrl of [gainersUrl, losersUrl]) {
      try {
        const pageResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: pageUrl,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 2000,
          }),
        });

        if (pageResponse.ok) {
          const pageData = await pageResponse.json();
          const pageMarkdown = pageData.data?.markdown || pageData.markdown || '';
          
          for (const line of pageMarkdown.split('\n')) {
            const match = line.match(/([A-Z]{1,5})\s*(?:[A-Za-z\s.]+)?\s*([-+]?\d+(?:\.\d+)?)\s*%/);
            if (match) {
              const symbol = match[1];
              const changePct = parseFloat(match[2]);
              
              if (!movers.find(m => m.symbol === symbol)) {
                movers.push({
                  symbol,
                  change_pct: Math.abs(changePct),
                  direction: changePct >= 0 ? 'up' : 'down',
                });
              }
            }
          }
        }
      } catch (e) {
        console.error(`Error scraping ${pageUrl}:`, e);
      }
    }

    console.log(`Scraped ${movers.length} movers from eToro`);
    return movers;

  } catch (error) {
    console.error('Error scraping eToro discover:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    console.log('Scraping daily movers from eToro...');
    const movers = await scrapeEtoroDiscover(FIRECRAWL_API_KEY);

    if (movers.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No movers found',
          movers_scraped: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get asset IDs for matched symbols
    const symbols = movers.map(m => m.symbol);
    const { data: assets } = await supabase
      .from('assets')
      .select('id, symbol')
      .in('symbol', symbols);

    const assetMap = new Map((assets || []).map(a => [a.symbol, a.id]));

    // Get traders who hold these assets
    const assetIds = assets?.map(a => a.id) || [];
    const { data: holdings } = await supabase
      .from('trader_holdings')
      .select('asset_id, trader_id')
      .in('asset_id', assetIds);

    // Group traders by asset
    const assetTraders = new Map<string, string[]>();
    for (const h of holdings || []) {
      if (!h.asset_id) continue;
      const traders = assetTraders.get(h.asset_id) || [];
      traders.push(h.trader_id);
      assetTraders.set(h.asset_id, traders);
    }

    // Delete today's existing movers
    const today = new Date().toISOString().split('T')[0];
    await supabase
      .from('daily_movers')
      .delete()
      .eq('date', today);

    // Insert new movers
    const moversToInsert = movers
      .filter(m => assetMap.has(m.symbol))
      .map(m => {
        const assetId = assetMap.get(m.symbol)!;
        return {
          asset_id: assetId,
          date: today,
          change_pct: m.change_pct,
          direction: m.direction,
          volume: m.volume || null,
          top_traders_trading: assetTraders.get(assetId)?.slice(0, 5) || null,
        };
      });

    if (moversToInsert.length > 0) {
      const { data: inserted, error } = await supabase
        .from('daily_movers')
        .insert(moversToInsert)
        .select();

      if (error) {
        console.error('Error inserting movers:', error);
        throw error;
      }

      console.log(`Inserted ${inserted?.length || 0} daily movers`);

      return new Response(
        JSON.stringify({
          success: true,
          movers_scraped: movers.length,
          movers_inserted: inserted?.length || 0,
          date: today,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        movers_scraped: movers.length,
        movers_inserted: 0,
        message: 'No matching assets found for scraped movers',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-daily-movers:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
