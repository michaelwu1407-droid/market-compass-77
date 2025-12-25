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
    const { sync_traders = false, trader_ids: specific_trader_ids, force = false, hours_stale = 6, hours_active = 7 * 24 } = await req.json().catch(() => ({}));
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (sync_traders) {
        console.log('sync_traders is true, invoking sync-traders function');
        const { data: syncResult, error: syncError } = await supabase.functions.invoke('sync-traders');
        
        if (syncError) {
            console.error("Error invoking sync-traders:", syncError);
            return new Response(JSON.stringify({ 
                error: "Failed to invoke sync-traders", 
                details: syncError 
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            });
        }
        
        console.log("sync-traders completed:", syncResult);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log("Enqueuing jobs for all traders after sync...");
        const { data: enqueueResult, error: enqueueError } = await supabase.functions.invoke('enqueue-sync-jobs', {
            body: { force: true }
        });
        
        if (enqueueError) {
            console.error("Error enqueuing jobs after sync:", enqueueError);
        }
        
        return new Response(JSON.stringify({ 
            message: `Sync-traders completed: ${syncResult?.synced || 0} traders synced. Total in database: ${syncResult?.total_traders || 0}`, 
            sync_result: syncResult,
            total_traders: syncResult?.total_traders || 0,
            enqueue_result: enqueueResult
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }

    // NUCLEAR MODE: Get ALL traders, no filtering, no exceptions
    console.log("NUCLEAR MODE: Fetching ALL traders from database...");
    let allTraderIds: string[] = [];
    
    if (specific_trader_ids && specific_trader_ids.length > 0) {
        allTraderIds = specific_trader_ids;
        console.log(`Using ${allTraderIds.length} specific trader IDs provided.`);
    } else {
        // Get ALL traders - paginate through everything
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        let totalFetched = 0;

        while (hasMore) {
            const { data: pageTraders, error: pageError } = await supabase
                .from('traders')
                .select('id')
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (pageError) {
                console.error(`Error fetching traders page ${page + 1}:`, pageError);
                // Continue with what we have
                break;
            }
            
            if (pageTraders && pageTraders.length > 0) {
                pageTraders.forEach(t => allTraderIds.push(t.id));
                totalFetched += pageTraders.length;
                page++;
                hasMore = pageTraders.length === pageSize;
                console.log(`Fetched page ${page}: ${pageTraders.length} traders (total: ${totalFetched})`);
            } else {
                hasMore = false;
            }
        }

        console.log(`NUCLEAR MODE: Found ${allTraderIds.length} total traders to enqueue.`);
    }

    if (allTraderIds.length === 0) {
        console.error("ERROR: No traders found in database!");
        return new Response(JSON.stringify({ 
            success: false,
            error: "No traders found in database",
            total_traders: 0
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }

    // NUCLEAR MODE: Create jobs for ALL traders, no filtering
    console.log(`NUCLEAR MODE: Creating jobs for ALL ${allTraderIds.length} traders (no filtering)...`);
    
    const jobsToInsert = allTraderIds.map(trader_id => ({
        trader_id,
        status: 'pending',
        job_type: 'deep_sync'
    }));

    console.log(`Prepared ${jobsToInsert.length} jobs to insert.`);

    // Insert in batches - NO ERROR HANDLING THAT STOPS US
    const batchSize = 500;
    let actualInserted = 0;
    const errors: any[] = [];

    for (let i = 0; i < jobsToInsert.length; i += batchSize) {
        const batch = jobsToInsert.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        
        try {
            const { data, error: insertError } = await supabase
                .from('sync_jobs')
                .insert(batch)
                .select('id');
            
            if (insertError) {
                console.error(`[BATCH ${batchNum}] Insert error:`, insertError);
                console.error(`[BATCH ${batchNum}] Error details:`, JSON.stringify(insertError, null, 2));
                errors.push({
                    batch: batchNum,
                    error: insertError.message || JSON.stringify(insertError),
                    trader_ids: batch.slice(0, 3).map(b => b.trader_id)
                });
                // CONTINUE - don't stop on errors
            } else {
                const batchInserted = data?.length || 0;
                actualInserted += batchInserted;
                console.log(`[BATCH ${batchNum}] ✓ Inserted ${batchInserted} jobs (total: ${actualInserted}/${jobsToInsert.length})`);
            }
        } catch (e: any) {
            console.error(`[BATCH ${batchNum}] Exception:`, e.message);
            errors.push({
                batch: batchNum,
                error: e.message || e.toString()
            });
            // CONTINUE - don't stop on exceptions
        }
    }

    // Verify what we actually have
    const { count: pendingCount, error: countError } = await supabase
        .from('sync_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    console.log(`NUCLEAR MODE COMPLETE: Inserted ${actualInserted} jobs. Current pending count: ${pendingCount || 0}`);

    return new Response(JSON.stringify({
        success: true,
        message: `NUCLEAR MODE: Created ${actualInserted} jobs for ${allTraderIds.length} traders`,
        traders_found: allTraderIds.length,
        jobs_created: actualInserted,
        pending_jobs_total: pendingCount || 0,
        errors: errors.length > 0 ? errors : null,
        note: "All filtering removed - jobs created for ALL traders"
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
    });

  } catch (error: any) {
    console.error("NUCLEAR MODE ERROR:", error);
    return new Response(JSON.stringify({ 
        success: false,
        error: error?.message || error?.toString() || 'Unknown error',
        stack: error?.stack
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
    });
  }
});
