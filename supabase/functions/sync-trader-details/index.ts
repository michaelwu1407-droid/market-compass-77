import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HOLDINGS_CROSS_CHECK_FIELDS = ['allocation_pct', 'profit_loss_pct'];
const DISCREPANCY_THRESHOLD_PCT = 5;

interface DiscrepancyLog {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  field_name: string;
  bullaware_value: string | null;
  firecrawl_value: string | null;
  difference_pct: number | null;
  value_used: string;
}

function checkDiscrepancy(
  field: string, 
  bullaware: any, 
  firecrawl: any,
  entityId: string,
  entityName: string
): DiscrepancyLog | null {
  if (bullaware === null || bullaware === undefined || firecrawl === null || firecrawl === undefined) {
    return null;
  }

  const bValue = parseFloat(String(bullaware));
  const fValue = parseFloat(String(firecrawl));

  if (!isNaN(bValue) && !isNaN(fValue)) {
    if (bValue === 0 && fValue === 0) return null;
    const diffPct = bValue !== 0 ? Math.abs((bValue - fValue) / bValue * 100) : Math.abs(fValue) * 100;
    
    if (diffPct > DISCREPANCY_THRESHOLD_PCT) {
      return {
        entity_type: 'holding',
        entity_id: entityId,
        entity_name: entityName,
        field_name: field,
        bullaware_value: String(bValue),
        firecrawl_value: String(fValue),
        difference_pct: Math.round(diffPct * 100) / 100,
        value_used: 'bullaware',
      };
    }
  }
  return null;
}

async function scrapePortfolioFromEtoro(username: string, firecrawlApiKey: string): Promise<any[] | null> {
  try {
    const url = `https://www.etoro.com/people/${username}/portfolio`;
    console.log(`Scraping eToro portfolio: ${url}`);

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
      console.error(`Firecrawl portfolio error for ${username}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';

    // Parse holdings from markdown - look for patterns like "AAPL 15.5% +12.3%"
    const holdings: any[] = [];
    const lines = markdown.split('\n');
    
    for (const line of lines) {
      // Pattern: Symbol followed by percentages
      const match = line.match(/([A-Z]{1,5})\s+(\d+(?:\.\d+)?)\s*%\s*([-+]?\d+(?:\.\d+)?)\s*%/);
      if (match) {
        holdings.push({
          symbol: match[1],
          allocation_pct: parseFloat(match[2]),
          profit_loss_pct: parseFloat(match[3]),
        });
      }
    }

    console.log(`Scraped ${holdings.length} holdings for ${username}`);
    return holdings;

  } catch (error) {
    console.error(`Error scraping portfolio for ${username}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BULLAWARE_API_KEY = Deno.env.get('BULLAWARE_API_KEY');
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!BULLAWARE_API_KEY) {
      throw new Error('BULLAWARE_API_KEY is not configured');
    }

    const hasFirecrawl = !!FIRECRAWL_API_KEY;
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    let username: string | null = null;
    try {
      const body = await req.json();
      username = body.username;
    } catch {
      // No body
    }

    console.log(`Syncing details for trader: ${username || 'all traders'}. Cross-checking: ${hasFirecrawl}`);

    let tradersToSync: { id: string; etoro_username: string }[] = [];
    
    if (username) {
      const { data: trader } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .eq('etoro_username', username)
        .maybeSingle();
      
      if (trader) tradersToSync = [trader];
    } else {
      const { data: allTraders } = await supabase
        .from('traders')
        .select('id, etoro_username');
      
      tradersToSync = allTraders || [];
    }

    console.log(`Processing ${tradersToSync.length} traders`);

    let totalHoldings = 0;
    let totalTrades = 0;
    let totalPerformance = 0;
    const allDiscrepancies: DiscrepancyLog[] = [];

    for (const trader of tradersToSync) {
      try {
        // Fetch portfolio from Bullaware
        const portfolioResponse = await fetch(
          `https://api.bullaware.com/v1/investors/${trader.etoro_username}/portfolio`,
          {
            headers: {
              'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        let bullwareHoldings: any[] = [];
        if (portfolioResponse.ok) {
          const portfolioData = await portfolioResponse.json();
          bullwareHoldings = (portfolioData.data || []).map((h: any) => ({
            trader_id: trader.id,
            asset_id: null,
            symbol: h.symbol || h.instrumentId,
            allocation_pct: h.allocation || h.percentage || h.weight,
            avg_open_price: h.avgOpenPrice || h.averagePrice || null,
            current_value: h.value || h.currentValue || null,
            profit_loss_pct: h.pnl || h.profitLoss || h.gain || null,
            updated_at: new Date().toISOString(),
          }));
        }

        // Cross-check with Firecrawl if available
        if (hasFirecrawl && bullwareHoldings.length > 0) {
          const firecrawlHoldings = await scrapePortfolioFromEtoro(trader.etoro_username, FIRECRAWL_API_KEY!);
          
          if (firecrawlHoldings && firecrawlHoldings.length > 0) {
            // Match holdings by symbol and compare
            for (const bHolding of bullwareHoldings) {
              const fHolding = firecrawlHoldings.find(f => f.symbol === bHolding.symbol);
              if (fHolding) {
                for (const field of HOLDINGS_CROSS_CHECK_FIELDS) {
                  const discrepancy = checkDiscrepancy(
                    field,
                    bHolding[field],
                    fHolding[field],
                    trader.id,
                    `${trader.etoro_username}/${bHolding.symbol}`
                  );
                  if (discrepancy) {
                    allDiscrepancies.push(discrepancy);
                  }
                }
              }
            }
          }
        }

        // Save holdings (always use Bullaware data)
        if (bullwareHoldings.length > 0) {
          await supabase
            .from('trader_holdings')
            .delete()
            .eq('trader_id', trader.id);

          const holdingsToInsert = bullwareHoldings.map(({ symbol, ...rest }) => rest);
          const { error: holdingsError } = await supabase
            .from('trader_holdings')
            .insert(holdingsToInsert);

          if (!holdingsError) totalHoldings += holdingsToInsert.length;
        }

        // Fetch and save trades (Bullaware only - no Firecrawl equivalent)
        const tradesResponse = await fetch(
          `https://api.bullaware.com/v1/investors/${trader.etoro_username}/trades`,
          {
            headers: {
              'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (tradesResponse.ok) {
          const tradesData = await tradesResponse.json();
          const trades = (tradesData.data || []).map((t: any) => ({
            trader_id: trader.id,
            asset_id: null,
            action: t.action || t.type || (t.isBuy ? 'buy' : 'sell'),
            amount: t.amount || t.units || null,
            price: t.price || t.openRate || null,
            percentage_of_portfolio: t.percentage || null,
            executed_at: t.executedAt || t.openDateTime || new Date().toISOString(),
          }));

          if (trades.length > 0) {
            const { error: tradesError } = await supabase
              .from('trades')
              .insert(trades);
            if (!tradesError) totalTrades += trades.length;
          }
        }

        // Fetch and save performance (Bullaware only)
        const performanceResponse = await fetch(
          `https://api.bullaware.com/v1/investors/${trader.etoro_username}/performance`,
          {
            headers: {
              'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (performanceResponse.ok) {
          const performanceData = await performanceResponse.json();
          const monthlyReturns = (performanceData.data?.monthlyReturns || []).map((p: any) => ({
            trader_id: trader.id,
            year: p.year,
            month: p.month,
            return_pct: p.return || p.gain || p.value,
          }));

          if (monthlyReturns.length > 0) {
            await supabase
              .from('trader_performance')
              .delete()
              .eq('trader_id', trader.id);

            const { error: perfError } = await supabase
              .from('trader_performance')
              .insert(monthlyReturns);
            if (!perfError) totalPerformance += monthlyReturns.length;
          }
        }

        console.log(`Synced details for ${trader.etoro_username}`);

      } catch (traderError) {
        console.error(`Error syncing ${trader.etoro_username}:`, traderError);
      }
    }

    // Log discrepancies
    if (allDiscrepancies.length > 0) {
      console.log(`Logging ${allDiscrepancies.length} holdings discrepancies...`);
      const { error: discError } = await supabase
        .from('data_discrepancies')
        .insert(allDiscrepancies);
      if (discError) console.error('Error logging discrepancies:', discError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        traders_processed: tradersToSync.length,
        holdings_synced: totalHoldings,
        trades_synced: totalTrades,
        performance_synced: totalPerformance,
        discrepancies_logged: allDiscrepancies.length,
        cross_checking_enabled: hasFirecrawl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-trader-details:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
