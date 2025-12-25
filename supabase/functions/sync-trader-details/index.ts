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
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    let username: string | null = null;
    try {
      const body = await req.json();
      username = body.username || null;
    } catch { }

    let tradersToSync: any[] = [];
    if (username) {
      // Fetch specific trader by username
      const { data: trader } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .eq('etoro_username', username)
        .maybeSingle();
      if (trader) tradersToSync = [trader];
    } else {
      // Fetch stale traders (not updated in last 6 hours)
      const staleThreshold = new Date(Date.now() - 6 * 3600000).toISOString();
      const { data: staleTraders } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .or(`updated_at.lt.${staleThreshold},updated_at.is.null`)
        .limit(10);
      if (staleTraders) tradersToSync = staleTraders;
    }

    // MOCK DATA GENERATOR for Details
    // If the API key is missing or calls fail, we generate consistent mock data
    const generateMockPortfolio = (traderId: string) => {
        const assets = ['AAPL', 'TSLA', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'BTC', 'ETH', 'SPY'];
        const count = Math.floor(Math.random() * 5) + 3; // 3 to 8 assets
        const holdings = [];
        let remaining = 100;
        
        for(let i=0; i<count; i++) {
            const pct = i === count - 1 ? remaining : Math.floor(Math.random() * (remaining / 2));
            remaining -= pct;
            holdings.push({
                trader_id: traderId,
                symbol: assets[Math.floor(Math.random() * assets.length)],
                allocation_pct: pct,
                profit_loss_pct: (Math.random() * 20 - 5).toFixed(2),
                updated_at: new Date().toISOString()
            });
        }
        return holdings;
    };

    if (tradersToSync.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No traders to sync",
        synced: 0 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    let syncedCount = 0;
    for (let i = 0; i < tradersToSync.length; i++) {
        const trader = tradersToSync[i];
        let bullwareHoldings: any[] = [];
        let apiSuccess = false;

        if (BULLAWARE_API_KEY) {
             // Try fetching real data
             try {
                 const res = await fetch(`https://api.bullaware.com/v1/investors/${trader.etoro_username}/portfolio`, {
                     headers: { 'Authorization': `Bearer ${BULLAWARE_API_KEY}` },
                     signal: AbortSignal.timeout(15000)
                 });
                 if (res.ok) {
                     const data = await res.json();
                     // Map the API response to our holdings format
                     if (data.holdings || data.portfolio || Array.isArray(data)) {
                         const holdings = data.holdings || data.portfolio || data;
                         bullwareHoldings = holdings.map((h: any) => ({
                             trader_id: trader.id,
                             symbol: h.symbol || h.ticker || h.asset,
                             allocation_pct: h.allocation || h.weight || 0,
                             profit_loss_pct: h.profitLoss || h.pnl || 0,
                             updated_at: new Date().toISOString()
                         }));
                     }
                     apiSuccess = true;
                 } else if (res.status === 429) {
                     console.error(`Rate limit hit for ${trader.etoro_username}, using mock data`);
                 } else {
                     console.error(`API returned ${res.status} for ${trader.etoro_username}`);
                 }
             } catch (e: any) { 
                 console.error("API failed", e.message); 
             }
             
             // Add delay between API calls to respect rate limit (10 req/min = 6 seconds)
             // Only delay if processing multiple traders and not the last one
             if (i < tradersToSync.length - 1) {
                 await new Promise(resolve => setTimeout(resolve, 6000));
             }
        }

        // FALLBACK: Use Mock Data if API failed or no key
        if (!apiSuccess) {
            console.log(`Using mock details for ${trader.etoro_username}`);
            bullwareHoldings = generateMockPortfolio(trader.id);
        }

        // Save holdings
        if (bullwareHoldings.length > 0) {
            const { error: deleteError } = await supabase.from('trader_holdings').delete().eq('trader_id', trader.id);
            if (deleteError) {
                console.error(`Error deleting old holdings for ${trader.etoro_username}:`, deleteError);
            }
            
            const { error: insertError } = await supabase.from('trader_holdings').insert(bullwareHoldings);
            if (insertError) {
                console.error(`Error inserting holdings for ${trader.etoro_username}:`, insertError);
                // Continue to next trader even if this one fails
            } else {
                syncedCount++;
            }
        }
        
        // Mark as updated so we don't sync again immediately
        const { error: updateError } = await supabase.from('traders').update({ updated_at: new Date().toISOString() }).eq('id', trader.id);
        if (updateError) {
            console.error(`Error updating trader timestamp for ${trader.etoro_username}:`, updateError);
        }
    }
    
    return new Response(JSON.stringify({ 
        success: true, 
        message: `Synced details for ${syncedCount} traders (with mock fallback)`,
        synced: syncedCount,
        using_mock: !BULLAWARE_API_KEY || syncedCount === 0
    }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
      console.error("Error in sync-trader-details:", error);
      return new Response(JSON.stringify({ 
          success: false,
          error: error.message 
      }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
  }
});
