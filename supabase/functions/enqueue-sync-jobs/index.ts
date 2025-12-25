import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TRADERS_TO_ENQUEUE = 1000;

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
        console.log('sync_traders is true, invoking sync-traders function');
        // Invoke sync-traders and wait for it to complete, then enqueue jobs for new traders
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
        // Wait a moment for traders to be inserted
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Now enqueue jobs for all traders (force mode to get new ones too)
        const { data: enqueueResult, error: enqueueError } = await supabase.functions.invoke('enqueue-sync-jobs', {
            body: { force: true }
        });
        
        if (enqueueError) {
            console.error("Error enqueuing jobs after sync:", enqueueError);
        }
        
        return new Response(JSON.stringify({ 
            message: "Sync-traders completed and jobs enqueued", 
            sync_result: syncResult,
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

      // Get stale traders
      const { data: staleTraders, error: staleError } = await supabase
        .from('traders')
        .select('id')
        .or(`updated_at.lt.${staleThreshold},updated_at.is.null`)
        .limit(MAX_TRADERS_TO_ENQUEUE);

      if (staleError) throw staleError;
      staleTraders.forEach(t => traderIdsToEnqueue.add(t.id));
      console.log(`Found ${staleTraders.length} stale traders (older than ${hours_stale}h).`);

      // Get active traders
      const { data: recentPosters, error: postersError } = await supabase
        .from('posts')
        .select('trader_id')
        .not('trader_id', 'is', null)
        .gt('created_at', activeThreshold)
        .limit(MAX_TRADERS_TO_ENQUEUE);
      
      if (postersError) throw postersError;
      recentPosters.forEach(p => traderIdsToEnqueue.add(p.trader_id!));
      console.log(`Found ${recentPosters.length} unique traders active in last ${hours_active / 24} days.`);
    }

    const finalTraderIds = Array.from(traderIdsToEnqueue);
    console.log(`Total unique traders to enqueue: ${finalTraderIds.length}`);

    if (finalTraderIds.length === 0) {
      return new Response(JSON.stringify({ message: "No traders to enqueue." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check existing pending jobs to avoid duplicates
    const { data: pendingJobs, error: pendingError } = await supabase
        .from('sync_jobs')
        .select('trader_id')
        .in('status', ['pending', 'in_progress']);

    if (pendingError) throw pendingError;
    const pendingTraderIds = new Set(pendingJobs.map(j => j.trader_id));
    
    const jobsToInsert = finalTraderIds
      .filter(id => !pendingTraderIds.has(id))
      .map(trader_id => ({
        trader_id,
        status: 'pending',
        job_type: 'deep_sync'
      }));

    console.log(`Filtered out ${pendingTraderIds.size} pending jobs. Inserting ${jobsToInsert.length} new jobs.`);

    if (jobsToInsert.length > 0) {
        const { error: insertError } = await supabase.from("sync_jobs").insert(jobsToInsert).select();
        if (insertError) {
            console.error("Error inserting sync jobs:", insertError);
            throw insertError;
        }
    }

    return new Response(JSON.stringify({
        message: `Successfully enqueued ${jobsToInsert.length} new sync jobs.`,
        enqueued_count: jobsToInsert.length
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
    });
  } catch (error) {
    console.error("Error enqueuing sync jobs:", error);
    return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
    });
  }
});