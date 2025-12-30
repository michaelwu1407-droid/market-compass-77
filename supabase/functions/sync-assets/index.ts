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
    // Important: do NOT overwrite existing enrichment data with nulls.
    // When an upstream value is missing, omit the column so upsert won't clobber.
    const assetsToUpsert = allAssets
      .map((asset: any) => {
        const symbol = (asset.symbol || asset.ticker || '').toString().trim();
        if (!symbol) return null;

        const row: Record<string, any> = {
          symbol,
          updated_at: new Date().toISOString(),
        };

        const setIfPresent = (key: string, value: unknown) => {
          if (value === null || value === undefined) return;
          row[key] = value;
        };

        setIfPresent('name', asset.name ?? asset.fullName);
        setIfPresent('asset_type', asset.type ?? asset.assetType ?? 'stock');

        setIfPresent('current_price', asset.price ?? asset.lastPrice);
        setIfPresent('price_change', asset.change ?? asset.priceChange);
        setIfPresent('price_change_pct', asset.changePct ?? asset.changePercent);

        setIfPresent('market_cap', asset.marketCap);
        setIfPresent('pe_ratio', asset.peRatio ?? asset.pe);
        setIfPresent('eps', asset.eps);
        setIfPresent('dividend_yield', asset.dividendYield);
        setIfPresent('high_52w', asset.high52Week ?? asset.yearHigh);
        setIfPresent('low_52w', asset.low52Week ?? asset.yearLow);
        setIfPresent('avg_volume', asset.avgVolume ?? asset.volume);
        setIfPresent('beta', asset.beta);

        setIfPresent('sector', asset.sector);
        setIfPresent('industry', asset.industry);
        setIfPresent('exchange', asset.exchange);
        setIfPresent('logo_url', asset.logoUrl ?? asset.logo);

        // Optional hints (if BullAware provides them)
        setIfPresent('country', asset.country ?? asset.countryCode);
        setIfPresent('currency', asset.currency ?? asset.quoteCurrency);

        return row;
      })
      .filter(Boolean);

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
