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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Force enqueuing ALL traders...");

    // Get all traders
    let allTraders: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageTraders, error: allError } = await supabase
        .from('traders')
        .select('id')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (allError) {
        console.error("Error fetching traders:", allError);
        throw allError;
      }
      
      if (pageTraders && pageTraders.length > 0) {
        allTraders = allTraders.concat(pageTraders);
        page++;
        hasMore = pageTraders.length === pageSize;
        console.log(`Fetched page ${page}: ${pageTraders.length} traders (total: ${allTraders.length})`);
      } else {
        hasMore = false;
      }
    }

    console.log(`Found ${allTraders.length} total traders. Creating jobs for all...`);

    // Mark old pending/in_progress jobs as completed
    const oldThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: markedCount } = await supabase
      .from('sync_jobs')
      .update({ status: 'completed', finished_at: new Date().toISOString() })
      .in('status', ['pending', 'in_progress'])
      .lt('created_at', oldThreshold)
      .select('id', { count: 'exact', head: true });
    
    if (markedCount && markedCount > 0) {
      console.log(`Marked ${markedCount} old jobs as completed.`);
    }

    // Create jobs for ALL traders
    const jobsToInsert = allTraders.map(t => ({
      trader_id: t.id,
      status: 'pending',
      job_type: 'deep_sync'
    }));

    console.log(`Creating ${jobsToInsert.length} jobs...`);

    // Insert in batches
    const batchSize = 500;
    let actualInserted = 0;
    const errors: any[] = [];

    for (let i = 0; i < jobsToInsert.length; i += batchSize) {
      const batch = jobsToInsert.slice(i, i + batchSize);
      const { data, error: insertError } = await supabase
        .from('sync_jobs')
        .insert(batch)
        .select('id');
      
      if (insertError) {
        console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, insertError);
        errors.push({
          batch: Math.floor(i / batchSize) + 1,
          error: insertError.message || JSON.stringify(insertError)
        });
      } else {
        const batchInserted = data?.length || 0;
        actualInserted += batchInserted;
        console.log(`✓ Inserted batch ${Math.floor(i / batchSize) + 1}: ${batchInserted} jobs`);
      }
    }

    // Verify insertion
    const { count: pendingCount } = await supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    return new Response(JSON.stringify({
      success: true,
      message: `Force enqueued ${actualInserted} jobs for ${allTraders.length} traders`,
      total_traders: allTraders.length,
      jobs_created: actualInserted,
      pending_jobs_after: pendingCount || 0,
      errors: errors.length > 0 ? errors : null
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Force enqueue error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || error?.toString() || 'Unknown error'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});

