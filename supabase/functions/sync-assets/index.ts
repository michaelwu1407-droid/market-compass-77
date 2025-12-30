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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!BULLAWARE_API_KEY) {
      throw new Error('BULLAWARE_API_KEY is not configured');
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
      // Fetch with pagination.
      // BullAware endpoints commonly use limit+offset (see investors endpoint), and some deployments
      // ignore page-based pagination. We default to offset paging with a safety cap.
      let offset = 0;
      const pageSize = 200;
      const maxItems = 2000;
      let hasMore = true;

      while (hasMore) {
        const bullwareUrl = `https://api.bullaware.com/v1/instruments?limit=${pageSize}&offset=${offset}`;
        console.log(`Fetching assets offset ${offset} (limit ${pageSize})...`);

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
        console.log(`Received ${items.length} assets (total: ${allAssets.length})`);

        offset += items.length;

        // Stop conditions
        if (items.length < pageSize) {
          hasMore = false;
        }
        if (allAssets.length >= maxItems) {
          console.log(`Reached maxItems=${maxItems}, stopping pagination early`);
          hasMore = false;
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
