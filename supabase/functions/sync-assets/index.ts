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
    // Use external Supabase project
    const SUPABASE_URL = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');

    if (!BULLAWARE_API_KEY) {
      throw new Error('BULLAWARE_API_KEY is not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('External Supabase environment variables are not configured');
    }

    console.log('Starting asset sync from Bullaware API...');

    // Parse request body for optional filters
    let symbols: string[] = [];
    try {
      const body = await req.json();
      symbols = body.symbols || [];
    } catch {
      // No body provided
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let allAssets: any[] = [];

    if (symbols.length > 0) {
      // Specific symbols requested
      const bullwareUrl = `https://api.bullaware.com/v1/instruments?symbols=${symbols.join(',')}`;
      console.log(`Fetching specific assets from Bullaware: ${bullwareUrl}`);

      const response = await fetch(bullwareUrl, {
        headers: {
          'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Bullaware API error: ${response.status}`);
      }

      const data = await response.json();
      allAssets = data.items || data.data || data.instruments || (Array.isArray(data) ? data : []);
    } else {
      // Fetch all with pagination
      let page = 1;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const bullwareUrl = `https://api.bullaware.com/v1/instruments?page=${page}&limit=${pageSize}`;
        console.log(`Fetching assets page ${page}...`);

        const response = await fetch(bullwareUrl, {
          headers: {
            'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Bullaware API error: ${response.status}`);
        }

        const data = await response.json();
        const items = data.items || data.data || data.instruments || (Array.isArray(data) ? data : []);
        
        allAssets.push(...items);
        console.log(`Page ${page}: received ${items.length} assets (total: ${allAssets.length})`);

        // Check if more pages
        const total = data.total || data.totalCount;
        if (total && allAssets.length >= total) {
          hasMore = false;
        } else if (items.length < pageSize) {
          hasMore = false;
        } else {
          page++;
          // Safety limit
          if (page > 100) {
            console.log('Reached page limit, stopping pagination');
            hasMore = false;
          }
        }
      }
    }

    console.log(`Total assets from Bullaware: ${allAssets.length}`);

    // Map Bullaware data to our assets table schema
    const assetsToUpsert = allAssets.map((asset: any) => ({
      symbol: asset.symbol || asset.ticker,
      name: asset.name || asset.fullName,
      asset_type: asset.type || asset.assetType || 'stock',
      current_price: asset.price || asset.lastPrice || null,
      price_change: asset.change || asset.priceChange || null,
      price_change_pct: asset.changePct || asset.changePercent || null,
      market_cap: asset.marketCap || null,
      pe_ratio: asset.peRatio || asset.pe || null,
      eps: asset.eps || null,
      dividend_yield: asset.dividendYield || null,
      high_52w: asset.high52Week || asset.yearHigh || null,
      low_52w: asset.low52Week || asset.yearLow || null,
      avg_volume: asset.avgVolume || asset.volume || null,
      beta: asset.beta || null,
      sector: asset.sector || null,
      industry: asset.industry || null,
      exchange: asset.exchange || null,
      logo_url: asset.logoUrl || asset.logo || null,
      updated_at: new Date().toISOString(),
    }));

    console.log(`Upserting ${assetsToUpsert.length} assets to database...`);

    // Upsert assets using symbol as unique key
    const { data: upsertedData, error: upsertError } = await supabase
      .from('assets')
      .upsert(assetsToUpsert, {
        onConflict: 'symbol',
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError);
      throw upsertError;
    }

    console.log(`Successfully synced ${upsertedData?.length || 0} assets`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: upsertedData?.length || 0,
        message: `Successfully synced ${upsertedData?.length || 0} assets from Bullaware`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-assets:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
