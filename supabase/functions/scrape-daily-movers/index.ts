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
    // Use external Supabase project
    const SUPABASE_URL = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    console.log('[scrape-daily-movers] Fetching price changes from assets...');

    // Get assets with price change data
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, symbol, name, price_change_pct, current_price')
      .not('price_change_pct', 'is', null)
      .order('price_change_pct', { ascending: false });

    if (assetsError) {
      console.error('[scrape-daily-movers] Error fetching assets:', assetsError);
      throw assetsError;
    }

    console.log(`[scrape-daily-movers] Found ${assets?.length || 0} assets with price data`);

    if (!assets || assets.length === 0) {
      console.log('[scrape-daily-movers] No assets with price data found.');
      console.log('[scrape-daily-movers] Run fetch-daily-prices first to get real-time price data.');
      
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No price data available. Run fetch-daily-prices first.',
          movers_inserted: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get top gainers and losers
    const gainers = assets.filter(a => (a.price_change_pct || 0) > 0).slice(0, 5);
    const losers = assets.filter(a => (a.price_change_pct || 0) < 0).slice(-5).reverse();

    const today = new Date().toISOString().split('T')[0];

    // Delete today's existing movers
    await supabase
      .from('daily_movers')
      .delete()
      .eq('date', today);

    // Get traders who hold these assets
    const assetIds = [...gainers, ...losers].map(a => a.id);
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

    // Prepare movers to insert
    const moversToInsert = [...gainers, ...losers].map(a => ({
      asset_id: a.id,
      date: today,
      change_pct: Math.abs(a.price_change_pct || 0),
      direction: (a.price_change_pct || 0) >= 0 ? 'up' : 'down',
      top_traders_trading: assetTraders.get(a.id)?.slice(0, 5) || null,
    }));

    if (moversToInsert.length > 0) {
      const { data: inserted, error } = await supabase
        .from('daily_movers')
        .insert(moversToInsert)
        .select();

      if (error) {
        console.error('[scrape-daily-movers] Error inserting movers:', error);
        throw error;
      }

      console.log(`[scrape-daily-movers] Inserted ${inserted?.length || 0} daily movers`);

      return new Response(
        JSON.stringify({
          success: true,
          movers_inserted: inserted?.length || 0,
          source: 'assets',
          date: today,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        movers_inserted: 0,
        message: 'No significant movers found',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[scrape-daily-movers] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
