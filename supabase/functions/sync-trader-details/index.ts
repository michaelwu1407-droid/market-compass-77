import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BULLAWARE_API_KEY = Deno.env.get('BULLAWARE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!BULLAWARE_API_KEY) {
      throw new Error('BULLAWARE_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get username from request body
    let username: string | null = null;
    try {
      const body = await req.json();
      username = body.username;
    } catch {
      // No body
    }

    console.log(`Syncing details for trader: ${username || 'all traders'}`);

    // If no username specified, get all traders from DB
    let tradersToSync: { id: string; etoro_username: string }[] = [];
    
    if (username) {
      const { data: trader } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .eq('etoro_username', username)
        .single();
      
      if (trader) {
        tradersToSync = [trader];
      }
    } else {
      const { data: allTraders } = await supabase
        .from('traders')
        .select('id, etoro_username');
      
      tradersToSync = allTraders || [];
    }

    console.log(`Syncing details for ${tradersToSync.length} traders`);

    let totalHoldings = 0;
    let totalTrades = 0;
    let totalPerformance = 0;

    for (const trader of tradersToSync) {
      try {
        // Fetch portfolio/holdings
        const portfolioResponse = await fetch(
          `https://api.bullaware.com/v1/investors/${trader.etoro_username}/portfolio`,
          {
            headers: {
              'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (portfolioResponse.ok) {
          const portfolioData = await portfolioResponse.json();
          const holdings = (portfolioData.data || []).map((h: any) => ({
            trader_id: trader.id,
            asset_id: null, // Will need to lookup or create asset
            allocation_pct: h.allocation || h.percentage || h.weight,
            avg_open_price: h.avgOpenPrice || h.averagePrice || null,
            current_value: h.value || h.currentValue || null,
            profit_loss_pct: h.pnl || h.profitLoss || h.gain || null,
            updated_at: new Date().toISOString(),
          }));

          if (holdings.length > 0) {
            // Delete existing holdings for this trader
            await supabase
              .from('trader_holdings')
              .delete()
              .eq('trader_id', trader.id);

            // Insert new holdings
            const { error: holdingsError } = await supabase
              .from('trader_holdings')
              .insert(holdings);

            if (!holdingsError) {
              totalHoldings += holdings.length;
            }
          }
        }

        // Fetch trades
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
            asset_id: null, // Will need to lookup
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

            if (!tradesError) {
              totalTrades += trades.length;
            }
          }
        }

        // Fetch monthly performance
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
            // Delete existing performance for this trader
            await supabase
              .from('trader_performance')
              .delete()
              .eq('trader_id', trader.id);

            const { error: perfError } = await supabase
              .from('trader_performance')
              .insert(monthlyReturns);

            if (!perfError) {
              totalPerformance += monthlyReturns.length;
            }
          }
        }

        console.log(`Synced details for ${trader.etoro_username}`);

      } catch (traderError) {
        console.error(`Error syncing ${trader.etoro_username}:`, traderError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        traders_processed: tradersToSync.length,
        holdings_synced: totalHoldings,
        trades_synced: totalTrades,
        performance_synced: totalPerformance,
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
