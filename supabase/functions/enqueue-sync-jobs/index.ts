import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// No limit - fetch all traders that need syncing

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sync_traders = false, trader_ids: specific_trader_ids, force = false, hours_stale = 6, hours_active = 7 * 24 } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (sync_traders) {
        console.log('sync_traders is true, invoking sync-traders function (respecting API rate limits)');
        
        // Call sync-traders once - it will fetch up to 3000 traders from Bullaware API
        // (with 6-second delays between pages to respect rate limits)
        // NO MOCK DATA - will fail if API doesn't work
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
        
        // After sync-traders completes, enqueue jobs for all traders (including new ones)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log("Enqueuing jobs for all traders...");
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

    let traderIdsToEnqueue = new Set<string>();

    if (specific_trader_ids && specific_trader_ids.length > 0) {
      // Mode 1: Enqueue specific trader IDs
      specific_trader_ids.forEach(id => traderIdsToEnqueue.add(id));
      console.log(`Received ${traderIdsToEnqueue.size} specific trader IDs to enqueue.`);

    } else if (force) {
      // Mode 2: Force enqueue all traders - paginate to get all
      console.log('Force mode enabled: enqueuing all traders.');
      let allTraders: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageTraders, error: allError } = await supabase
          .from('traders')
          .select('id')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (allError) throw allError;
        
        if (pageTraders && pageTraders.length > 0) {
          allTraders = allTraders.concat(pageTraders);
          pageTraders.forEach(t => traderIdsToEnqueue.add(t.id));
          page++;
          hasMore = pageTraders.length === pageSize;
          console.log(`Fetched page ${page}: ${pageTraders.length} traders (total so far: ${allTraders.length})`);
        } else {
          hasMore = false;
        }
      }

      console.log(`Found ${allTraders.length} total traders to enqueue.`);

    } else {
      // Mode 3: Enqueue stale and active traders
      const staleThreshold = new Date(Date.now() - hours_stale * 3600000).toISOString();
      const activeThreshold = new Date(Date.now() - hours_active * 3600000).toISOString();

      // Get stale traders - NO LIMIT, fetch all that need syncing
      // Query for traders with updated_at < threshold OR updated_at IS NULL
      const { data: staleTraders, error: staleError } = await supabase
        .from('traders')
        .select('id')
        .or(`updated_at.lt.${staleThreshold},updated_at.is.null`);

      if (staleError) {
        console.error("Error fetching stale traders:", staleError);
        // Try alternative query format if the first fails
        const { data: staleTradersAlt, error: staleErrorAlt } = await supabase
          .from('traders')
          .select('id')
          .lt('updated_at', staleThreshold);
        
        if (staleErrorAlt) {
          console.error("Alternative query also failed:", staleErrorAlt);
          throw staleError;
        }
        
        // Also get traders with null updated_at
        const { data: nullTraders, error: nullError } = await supabase
          .from('traders')
          .select('id')
          .is('updated_at', null);
        
        if (nullError) {
          console.error("Error fetching null updated_at traders:", nullError);
        } else if (nullTraders) {
          nullTraders.forEach(t => traderIdsToEnqueue.add(t.id));
        }
        
        if (staleTradersAlt) {
          staleTradersAlt.forEach(t => traderIdsToEnqueue.add(t.id));
        }
        console.log(`Found ${(staleTradersAlt?.length || 0) + (nullTraders?.length || 0)} stale traders (older than ${hours_stale}h).`);
      } else {
        if (staleTraders) {
          staleTraders.forEach(t => traderIdsToEnqueue.add(t.id));
          console.log(`Found ${staleTraders.length} stale traders (older than ${hours_stale}h).`);
        }
      }

      // Get active traders - NO LIMIT
      const { data: recentPosters, error: postersError } = await supabase
        .from('posts')
        .select('trader_id')
        .not('trader_id', 'is', null)
        .gt('created_at', activeThreshold);
      
      if (postersError) throw postersError;
      recentPosters.forEach(p => traderIdsToEnqueue.add(p.trader_id!));
      console.log(`Found ${recentPosters.length} unique traders active in last ${hours_active / 24} days.`);
    }

    const finalTraderIds = Array.from(traderIdsToEnqueue);
    console.log(`Total unique traders to enqueue: ${finalTraderIds.length}`);

    if (finalTraderIds.length === 0) {
      console.log("WARNING: No traders found to enqueue. This might indicate a problem.");
      return new Response(JSON.stringify({ 
        success: false,
        message: "No traders to enqueue.",
        debug: {
          force_mode: force,
          specific_ids_provided: specific_trader_ids?.length || 0,
          hours_stale: hours_stale,
          hours_active: hours_active
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check existing pending jobs to avoid duplicates (unless force mode)
    let jobsToInsert: any[] = [];
    if (force) {
      // In force mode, create jobs for all traders
      // First, mark any existing pending/in_progress jobs as completed if they're old
      const oldThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
      const { count: markedCount } = await supabase
        .from('sync_jobs')
        .update({ status: 'completed', finished_at: new Date().toISOString() })
        .in('status', ['pending', 'in_progress'])
        .lt('created_at', oldThreshold)
        .select('id', { count: 'exact', head: true });
      
      if (markedCount && markedCount > 0) {
        console.log(`Force mode: Marked ${markedCount} old jobs as completed.`);
      }
      
      // Now create jobs for all traders (INSERT allows multiple pending per trader)
      jobsToInsert = finalTraderIds.map(trader_id => ({
        trader_id,
        status: 'pending',
        job_type: 'deep_sync'
      }));
      console.log(`Force mode: Creating ${jobsToInsert.length} jobs for all traders.`);
    } else {
      // Normal mode: only avoid duplicates for in_progress, allow multiple pending
      // This allows queue to grow beyond 240
      const { data: inProgressJobs, error: inProgressError } = await supabase
          .from('sync_jobs')
          .select('trader_id')
          .eq('status', 'in_progress');

      if (inProgressError) throw inProgressError;
      const inProgressTraderIds = new Set(inProgressJobs.map(j => j.trader_id));
      
      // Only filter out in_progress, allow multiple pending jobs
      jobsToInsert = finalTraderIds
        .filter(id => !inProgressTraderIds.has(id))
        .map(trader_id => ({
          trader_id,
          status: 'pending',
          job_type: 'deep_sync'
        }));

      console.log(`Filtered out ${inProgressTraderIds.size} in_progress jobs. Inserting ${jobsToInsert.length} new pending jobs.`);
    }

    let actualInserted = 0;
    console.log(`[DEBUG] About to insert ${jobsToInsert?.length || 0} jobs. jobsToInsert type: ${typeof jobsToInsert}, is array: ${Array.isArray(jobsToInsert)}`);
    
    if (!jobsToInsert || jobsToInsert.length === 0) {
      console.error(`[DEBUG] ERROR: jobsToInsert is empty or undefined! finalTraderIds.length: ${finalTraderIds.length}, force: ${force}`);
      return new Response(JSON.stringify({
        success: false,
        error: "No jobs to insert - this should not happen if traders were found",
        debug: {
          final_trader_ids: finalTraderIds.length,
          force_mode: force,
          jobs_to_insert_length: jobsToInsert?.length || 0
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    if (jobsToInsert.length > 0) {
        // Insert in batches to avoid timeout
        const batchSize = 500;
        for (let i = 0; i < jobsToInsert.length; i += batchSize) {
            const batch = jobsToInsert.slice(i, i + batchSize);
            // Use INSERT (not upsert) to allow multiple pending jobs per trader
            // This allows queue to grow beyond 240
            const { data, error: insertError } = await supabase.from("sync_jobs").insert(batch).select('id');
            if (insertError) {
                console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError);
                console.error(`Error details:`, JSON.stringify(insertError, null, 2));
                console.error(`Batch that failed:`, JSON.stringify(batch.slice(0, 3), null, 2)); // Log first 3 items
                // If it's a duplicate key error, that's okay - continue (though shouldn't happen with insert)
                if (insertError.message && (insertError.message.includes('duplicate') || insertError.message.includes('unique'))) {
                    console.warn(`Some duplicates in batch ${i / batchSize + 1}, continuing...`);
                    // Don't count duplicates as inserted
                } else if (insertError.message && insertError.message.includes('permission') || insertError.message.includes('policy')) {
                    // RLS/permission error - this is critical
                    console.error(`CRITICAL: Permission/RLS error inserting batch ${i / batchSize + 1}. This should not happen with service role.`);
                    throw insertError; // Throw to surface the issue
                } else {
                    // For other errors, log but continue with next batch
                    console.error(`Batch ${i / batchSize + 1} failed, continuing with next batch...`);
                }
            } else {
                const batchInserted = data?.length || 0;
                actualInserted += batchInserted;
                console.log(`✓ Inserted batch ${i / batchSize + 1}: ${batchInserted} jobs (total: ${actualInserted}/${jobsToInsert.length})`);
            }
        }
    }

    return new Response(JSON.stringify({
        success: true,
        message: `Successfully enqueued ${actualInserted} new sync jobs.`,
        enqueued_count: actualInserted,
        attempted: jobsToInsert?.length || 0,
        jobs_to_insert: jobsToInsert?.length || 0,
        final_trader_ids: finalTraderIds.length
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
    });
  } catch (error: any) {
    console.error("Error enqueuing sync jobs:", error);
    return new Response(JSON.stringify({ 
        success: false,
        error: error?.message || error?.toString() || 'Unknown error',
        enqueued_count: 0
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
    });
  }
});