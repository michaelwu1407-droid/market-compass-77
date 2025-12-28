
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
        const envUrl = Deno.env.get('SUPABASE_URL');
        const SUPABASE_URL = envUrl && envUrl.length > 0 ? envUrl : new URL(req.url).origin;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Prefer eToro (when configured) and fall back to BullAware.
        // We don't hardcode eToro endpoints here; configure via env so this stays stable.
                // - ETORO_TRADERS_URL: optional URL template; supports {page} and {pagesize}/{limit} placeholders.
                //   (We also still support legacy {offset}/{limit} templates.)
        const ETORO_TRADERS_URL = Deno.env.get('ETORO_TRADERS_URL');

    let apiUsed: 'etoro' | 'bullaware' | 'none' = 'none';
    let allTraders: any[] = [];
        let apiWorks = true;

        const etoroHeaders = {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };

        const extractEtoroRankingsItems = (data: any): any[] => {
            if (!data) return [];
            if (Array.isArray(data)) return data;
            const candidates = [
                data.items,
                data.Items,
                data.data,
                data.Data,
                data.results,
                data.Results,
                data.rankings,
                data.Rankings,
                data.investors,
                data.traders,
                data.users,
            ];
            for (const c of candidates) {
                if (Array.isArray(c)) return c;
            }
            if (typeof data === 'object' && (data.CID !== undefined || data.Value !== undefined)) return [data];
            return [];
        };

        const clampInt = (v: unknown, fallback: number, min: number, max: number) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(min, Math.min(max, Math.floor(n)));
        };

        const asFiniteNumber = (v: unknown): number | null => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string') {
                const t = v.trim();
                if (!t) return null;
                const n = Number(t);
                if (Number.isFinite(n)) return n;
            }
            return null;
        };

        const buildEtoroRankingsUrl = (templateOrBase: string, page: number, pageSize: number) => {
            // Supports either placeholders ({page}/{pagesize}/{limit}) or a base URL without pagination params.
            const hasPlaceholders = /\{page\}|\{pagesize\}|\{limit\}|\{offset\}/.test(templateOrBase);
            if (hasPlaceholders) {
                const offset = page * pageSize;
                return templateOrBase
                    .replaceAll('{page}', String(page))
                    .replaceAll('{pagesize}', String(pageSize))
                    .replaceAll('{limit}', String(pageSize))
                    .replaceAll('{offset}', String(offset));
            }

            // No placeholders: treat as a base URL and inject page/pagesize if absent.
            const u = new URL(templateOrBase);
            if (!u.searchParams.has('page')) u.searchParams.set('page', String(page));
            // eToro uses 'pagesize' (lowercase) per OpenAPI.
            if (!u.searchParams.has('pagesize')) u.searchParams.set('pagesize', String(pageSize));
            return u.toString();
        };

        const body = await req.json().catch(() => ({}));
        const startPage = clampInt(body.start_page, 0, 0, 10_000);
        const pagesToFetch = clampInt(body.max_pages, 1, 1, 50);
        // OpenAPI suggests 50-100; keep a hard cap to avoid timeouts.
        const pageSize = clampInt(body.page_size, 50, 1, 100);
        const endPageExclusive = startPage + pagesToFetch;

        // 1) Attempt eToro if configured
        if (ETORO_TRADERS_URL) {
            console.log(`Attempting to fetch traders from eToro (ETORO_TRADERS_URL configured)...`);

            for (let i = 0; i < pagesToFetch; i++) {
                const page = startPage + i;
                const limit = pageSize;
                const url = buildEtoroRankingsUrl(ETORO_TRADERS_URL, page, pageSize);
                try {
                    const res = await fetch(url, {
                        headers: etoroHeaders,
                        signal: AbortSignal.timeout(15000),
                    });

                    const raw = await res.text().catch(() => '');
                    if (!res.ok) {
                        console.error(`eToro traders HTTP ${res.status}: ${raw.substring(0, 300)}`);
                        break;
                    }

                    let data: any = {};
                    try {
                        data = raw ? JSON.parse(raw) : {};
                    } catch {
                        console.error('eToro traders JSON parse failed, raw:', raw.substring(0, 300));
                        break;
                    }

                    const pageTraders = extractEtoroRankingsItems(data);

                    if (!Array.isArray(pageTraders) || pageTraders.length === 0) {
                        console.log(`eToro page ${page + 1}: no traders, stopping.`);
                        break;
                    }

                    allTraders = allTraders.concat(pageTraders);
                    apiUsed = 'etoro';
                    console.log(`eToro page ${page}: fetched ${pageTraders.length} traders (total=${allTraders.length})`);

                    if (pageTraders.length < limit) break;
                    if (i < pagesToFetch - 1) await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (e) {
                    console.error('eToro traders request failed:', (e as Error)?.message || String(e));
                    break;
                }
            }
        }

        // 2) Fall back to BullAware if eToro didn't return anything
        if (allTraders.length === 0) {
            if (!BULLAWARE_API_KEY) {
                console.error('No eToro traders returned and BULLAWARE_API_KEY not configured.');
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: 'No trader source configured',
                        message: 'Set ETORO_TRADERS_URL or BULLAWARE_API_KEY',
                        synced: 0,
                        total_traders: 0,
                    }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                );
            }

            console.log(`Attempting to fetch traders from Bullaware API...`);
            console.log(`[DEBUG] BULLAWARE_API_KEY present: Yes (length: ${BULLAWARE_API_KEY.length})`);
    
            // Note: we keep the existing pagination behavior.
            let page = startPage;
        
        while (page < endPageExclusive) {
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
                    console.log(`[DEBUG] Page ${page + 1} full response (first 1000 chars):`, JSON.stringify(data).substring(0, 1000));
                    
                    // Try multiple possible response formats
                    const pageTraders = data.items || data.data || data.investors || data.results || (Array.isArray(data) ? data : []);
                    
                    console.log(`[DEBUG] Page ${page + 1} parsed traders count: ${pageTraders.length}`);
                    console.log(`[DEBUG] Page ${page + 1} request was: limit=1000&offset=${page * 1000}`);
                    
                    if (pageTraders.length === 0) {
                        console.log(`Page ${page + 1}: No more traders, stopping pagination. Response:`, JSON.stringify(data).substring(0, 500));
                        break;
                    }
                    
                    // CRITICAL: If API only returns 10 traders when we request 1000, log a warning
                    if (pageTraders.length < 100 && page === 0) {
                        console.error(`[WARNING] Bullaware API only returned ${pageTraders.length} traders when requesting 1000. This suggests:`);
                        console.error(`  - API might be ignoring limit parameter`);
                        console.error(`  - API might have a default limit`);
                        console.error(`  - API response structure might be different`);
                        console.error(`  - Full response keys:`, Object.keys(data));
                        console.error(`  - Sample response:`, JSON.stringify(data).substring(0, 2000));
                    }
                    
                    allTraders = allTraders.concat(pageTraders);
                    apiUsed = 'bullaware';
                    console.log(`Page ${page + 1}: Fetched ${pageTraders.length} traders (total: ${allTraders.length})`);
                    
                    if (pageTraders.length < 1000) {
                        // Last page
                        console.log(`Page ${page + 1}: Received ${pageTraders.length} traders (less than 1000), stopping pagination.`);
                        break;
                    }
                    
                    page++;
                    apiWorks = true;
                    
                    // Add delay between pages to respect rate limits (10 req/min = 6 seconds between requests)
                    if (page < endPageExclusive) {
                        console.log(`Waiting 6 seconds before next page to respect API rate limit...`);
                        await new Promise(resolve => setTimeout(resolve, 6000));
                    }
                } else {
                    const status = response.status;
                    const errorText = await response.text().catch(() => 'Unable to read error response');
                    console.error(`Bullaware API Error on page ${page + 1}: Status ${status}, Response: ${errorText.substring(0, 500)}`);
                    
                    if (status === 429) {
                        console.error(`Rate limit hit on page ${page + 1}. Stopping pagination.`);
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
        
            if (allTraders.length > 0) {
                console.log(`Successfully fetched ${allTraders.length} traders from Bullaware API.`);
            } else {
                console.error('Bullaware API returned no traders.');
            }
        }

        if (allTraders.length === 0) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'No traders returned',
                    synced: 0,
                    total_traders: 0,
                    message: 'eToro returned no traders and BullAware returned no traders',
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        console.log(`Processing ${allTraders.length} traders for upsert (source=${apiUsed}).`);

        const tradersToUpsert = allTraders.map((trader) => {
            const v = trader?.Value ?? trader?.value ?? trader;
            const etoroUsername = v?.UserName || v?.userName || v?.username || trader?.username || trader?.userName || trader?.etoro_username || trader?.id;
            const etoroCid = trader?.CID ?? trader?.cid ?? v?.CustomerId ?? v?.customerId ?? trader?.customerId ?? trader?.CustomerId;

            return {
                etoro_username: etoroUsername,
                display_name: v?.DisplayName || v?.displayName || v?.fullName || v?.name || etoroUsername,
                avatar_url: v?.avatar || v?.avatarUrl || v?.picture || v?.image || v?.profileImage || v?.photo || null,
                bio: v?.bio || v?.description || v?.about || null,
                country: v?.country || v?.location || null,
                verified: typeof v?.Verified === 'boolean' ? v.Verified : (typeof v?.verified === 'boolean' ? v.verified : (typeof v?.isVerified === 'boolean' ? v.isVerified : null)),
                etoro_cid: etoroCid ?? null,
                win_ratio: asFiniteNumber(v?.WinRatio ?? v?.winRatio ?? v?.win_ratio ?? v?.winRate ?? v?.win_rate),
                risk_score: asFiniteNumber(v?.RiskScore ?? v?.riskScore ?? v?.risk_score ?? v?.risk),
                copiers: v?.Copiers ?? v?.copiers ?? v?.copier_count ?? v?.followers ?? 0,
                gain_12m: v?.Gain ?? v?.gain ?? v?.gain12Months ?? v?.gain_12m ?? v?.gain_12_months ?? v?.return_12m ?? null,
                gain_24m: v?.gain24Months || v?.gain_24m || v?.return_24m || null,
                max_drawdown: v?.WeeklyDD ?? v?.weeklyDD ?? v?.DailyDD ?? v?.dailyDD ?? v?.maxDrawdown ?? v?.max_drawdown ?? v?.drawdown ?? null,
                tags: v?.tags || v?.styles || v?.categories || null,
                updated_at: new Date().toISOString(),
                active_since: v?.activeSince || v?.memberSince || v?.createdAt || v?.created_at || null,
                last_etoro_sync_at: apiUsed === 'etoro' ? new Date().toISOString() : null,
                trader_source: apiUsed,
            };
        }).filter(t => t.etoro_username); // Filter out any traders without a username

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
                api_used: apiUsed
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
