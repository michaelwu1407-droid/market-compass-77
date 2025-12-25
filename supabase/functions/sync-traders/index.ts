
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

    let apiWorks = false;
    let allBullwareTraders: any[] = [];

    if (!BULLAWARE_API_KEY) {
        console.error("BULLAWARE_API_KEY not found. Cannot fetch traders.");
        return new Response(
            JSON.stringify({
                success: false,
                error: "BULLAWARE_API_KEY not configured",
                synced: 0,
                total_traders: 0,
                message: "API key missing - check environment variables"
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Try to fetch from Bullaware API (respecting rate limits)
    // API limit is 1000 per request, and likely has rate limits (e.g., 10 req/min)
    // So we'll fetch one page per call and spread discovery over time
    console.log(`Attempting to fetch traders from Bullaware API...`);
    console.log(`[DEBUG] BULLAWARE_API_KEY present: Yes (length: ${BULLAWARE_API_KEY.length})`);
    const maxPages = 10; // Fetch up to 10,000 traders per call (to respect rate limits)
    let page = 0;
        
        while (page < maxPages) {
            try {
                const bullwareUrl = `https://api.bullaware.com/v1/investors?limit=1000&offset=${page * 1000}`;
                const response = await fetch(bullwareUrl, {
                    headers: {
                        'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    signal: AbortSignal.timeout(15000)
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`[DEBUG] Page ${page + 1} response structure:`, Object.keys(data));
                    
                    // Try multiple possible response formats
                    const pageTraders = data.items || data.data || data.investors || data.results || (Array.isArray(data) ? data : []);
                    
                    if (pageTraders.length === 0) {
                        console.log(`Page ${page + 1}: No more traders, stopping pagination. Response:`, JSON.stringify(data).substring(0, 500));
                        break;
                    }
                    
                    allBullwareTraders = allBullwareTraders.concat(pageTraders);
                    console.log(`Page ${page + 1}: Fetched ${pageTraders.length} traders (total: ${allBullwareTraders.length})`);
                    
                    if (pageTraders.length < 1000) {
                        // Last page
                        break;
                    }
                    
                    page++;
                    apiWorks = true;
                    
                    // Add delay between pages to respect rate limits (10 req/min = 6 seconds between requests)
                    if (page < maxPages) {
                        console.log(`Waiting 6 seconds before next page to respect API rate limit...`);
                        await new Promise(resolve => setTimeout(resolve, 6000));
                    }
                } else {
                    const status = response.status;
                    const errorText = await response.text().catch(() => 'Unable to read error response');
                    console.error(`Bullaware API Error on page ${page + 1}: Status ${status}, Response: ${errorText.substring(0, 500)}`);
                    
                    if (status === 429) {
                        console.error(`Rate limit hit on page ${page + 1}. Will use mock data for remaining.`);
                        apiWorks = false;
                        break;
                    }
                    
                    if (status === 401 || status === 403) {
                        console.error(`Authentication error (${status}). Check BULLAWARE_API_KEY.`);
                        apiWorks = false;
                        break;
                    }
                    
                    if (page === 0) {
                        apiWorks = false;
                    }
                    break;
                }
            } catch (error: any) {
                console.error(`Fetch to Bullaware failed on page ${page + 1}:`, error.message || error);
                console.error(`Error details:`, error);
                if (page === 0) {
                    apiWorks = false;
                }
                break;
            }
        }
        
        if (allBullwareTraders.length > 0) {
            console.log(`Successfully fetched ${allBullwareTraders.length} traders from Bullaware API.`);
            apiWorks = true;
        } else {
            console.error("Bullaware API returned no traders.");
            apiWorks = false;
        }

    if (!apiWorks || allBullwareTraders.length === 0) {
        console.error("Bullaware API failed or returned no data. Cannot proceed without real data.");
        return new Response(
            JSON.stringify({
                success: false,
                error: "Bullaware API failed or returned no data. No mock data will be generated.",
                synced: 0,
                total_traders: 0,
                message: "API call failed - check BULLAWARE_API_KEY and API status"
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`Processing ${allBullwareTraders.length} traders for upsert.`);

    const tradersToUpsert = allBullwareTraders.map(trader => ({
        etoro_username: trader.username || trader.userName || trader.etoro_username || trader.id,
        display_name: trader.displayName || trader.fullName || trader.name || trader.username || trader.userName || trader.etoro_username,
        risk_score: trader.riskScore || trader.risk_score || trader.risk || null,
        copiers: trader.copiers || trader.copier_count || trader.followers || 0,
        gain_12m: trader.gain12Months || trader.gain_12m || trader.gain_12_months || trader.return_12m || null,
        updated_at: new Date().toISOString(),
    })).filter(t => t.etoro_username); // Filter out any traders without a username

    if (tradersToUpsert.length > 0) {
        console.log(`Attempting to upsert ${tradersToUpsert.length} traders...`);
        
        // Insert in batches to avoid timeouts and ensure all get inserted
        const insertBatchSize = 500;
        let totalInserted = 0;
        
        for (let i = 0; i < tradersToUpsert.length; i += insertBatchSize) {
            const batch = tradersToUpsert.slice(i, i + insertBatchSize);
            console.log(`Upserting batch ${Math.floor(i / insertBatchSize) + 1}: ${batch.length} traders...`);
            
            const { data, error: upsertError } = await supabase
                .from('traders')
                .upsert(batch, { onConflict: 'etoro_username', ignoreDuplicates: false })
                .select('etoro_username');
            
            if (upsertError) {
                console.error(`Supabase upsert error on batch ${Math.floor(i / insertBatchSize) + 1}:`, upsertError);
                throw upsertError;
            }
            
            const batchInserted = data?.length || 0;
            totalInserted += batchInserted;
            console.log(`Batch ${Math.floor(i / insertBatchSize) + 1} completed: ${batchInserted} traders inserted/updated`);
        }

        console.log(`Successfully synced ${totalInserted} traders total.`);
        
        // Verify the count after insertion
        const { count: newCount } = await supabase
            .from('traders')
            .select('*', { count: 'exact', head: true });
        console.log(`Total traders in database after sync: ${newCount}`);
        
        // Note: enqueue-sync-jobs is called by the caller (enqueue-sync-jobs when sync_traders=true)
        // No need to call it here to avoid redundant calls

    } else {
        console.log("No traders to upsert.");
    }

    // Get final count
    const { count: finalCount } = await supabase
        .from('traders')
        .select('*', { count: 'exact', head: true });
    
    return new Response(
      JSON.stringify({
        success: true,
        synced: tradersToUpsert.length,
        total_traders: finalCount || 0,
        message: `Synced ${tradersToUpsert.length} traders. Total in database: ${finalCount || 0}`,
        api_used: apiWorks
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Critical error in sync-traders:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error?.message || error?.toString() || 'Unknown error',
        synced: 0,
        total_traders: 0
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
