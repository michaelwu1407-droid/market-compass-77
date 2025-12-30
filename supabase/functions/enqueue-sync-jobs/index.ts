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
    const {
      sync_traders = false,
      trader_ids: specific_trader_ids,
      force = false,
      sync_bullaware_jobs = true,
      sync_etoro_profiles = true,
      etoro_profiles_limit = 100,
      etoro_profiles_stale_hours = 24,
      bullaware_stale_hours = 72,
      bullaware_traders_limit = 500,
      debug = false,
    } = await req.json().catch(() => ({}));
    
    // Use native SUPABASE_URL - functions are deployed on this project
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (sync_traders) {
      console.log('sync_traders is true, invoking sync-traders function');
      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-traders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (!syncResponse.ok) {
        return new Response(JSON.stringify({ error: "Failed to invoke sync-traders" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500
        });
      }
      
      const syncResult = await syncResponse.json();
      return new Response(JSON.stringify({ message: `Sync completed`, sync_result: syncResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Choose candidates to enqueue (do NOT enqueue all traders by default; it floods the queue).
    console.log("Selecting trader candidates for enqueue...");
    let allTraderIds: string[] = [];
    
    if (specific_trader_ids && specific_trader_ids.length > 0) {
      allTraderIds = specific_trader_ids;
    } else {
      const rawStaleHours = Number(bullaware_stale_hours);
      const staleHours = Math.max(0, Number.isFinite(rawStaleHours) ? rawStaleHours : 72);
      const cutoffIso = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();
      const rawLimit = Number(bullaware_traders_limit);
      const limit = Math.max(0, Math.min(Number.isFinite(rawLimit) ? rawLimit : 500, 2000));

      const { data: candidateTraders, error } = await supabase
        .from('traders')
        .select('id')
        .or(`details_synced_at.is.null,details_synced_at.lt.${cutoffIso}`)
        .order('details_synced_at', { ascending: true, nullsFirst: true })
        .limit(limit);

      if (error) {
        console.error('Error selecting stale traders for enqueue:', error);
      } else {
        allTraderIds = (candidateTraders || []).map((t: any) => t.id).filter(Boolean);
      }
    }

    if (allTraderIds.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No traders found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let actualInserted = 0;
    if (sync_bullaware_jobs) {
      // One API request per job to respect Bullaware 10 req/min.
      // These job types map 1:1 to endpoints in sync-trader-details.
      const jobTypes = ['investor_details', 'risk_score', 'metrics', 'portfolio'] as const;

      // De-dupe: do not enqueue jobs that are already pending or in_progress.
      const { data: existing, error: existingErr } = await supabase
        .from('sync_jobs')
        .select('trader_id, job_type, status')
        .in('trader_id', allTraderIds)
        .in('job_type', Array.from(jobTypes))
        .in('status', ['pending', 'in_progress']);

      if (existingErr) {
        console.warn('Warning: failed to check existing sync jobs (continuing anyway):', existingErr);
      }

      const existingKey = new Set((existing || []).map((j: any) => `${j.trader_id}:${j.job_type}`));

      const jobsToInsert = allTraderIds.flatMap((trader_id) =>
        jobTypes
          .filter((job_type) => force || !existingKey.has(`${trader_id}:${job_type}`))
          .map((job_type) => ({ trader_id, status: 'pending', job_type }))
      );
      const batchSize = 500;

      for (let i = 0; i < jobsToInsert.length; i += batchSize) {
        const batch = jobsToInsert.slice(i, i + batchSize);
        const { data, error } = await supabase.from('sync_jobs').insert(batch).select('id');
        if (error) {
          // Surface schema mismatches clearly (common: missing job_type column).
          console.error('Error inserting sync_jobs batch:', error);
          return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Failed inserting sync_jobs',
            hint: 'Check sync_jobs schema has columns: trader_id, status, job_type',
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          });
        }
        actualInserted += data?.length || 0;
      }
    }

    // Optionally enqueue CID-based eToro profile enrichment jobs (limited and de-duped).
    // This uses the stable eToro CID rankings endpoint via sync-trader-etoro.
    let etoroJobsInserted = 0;
    const etoroDebug: Record<string, any> = {};
    if (sync_etoro_profiles) {
      const rawLimit = Number(etoro_profiles_limit);
      const limit = Math.max(0, Math.min(Number.isFinite(rawLimit) ? rawLimit : 0, 500));
      etoroDebug.requested_limit = limit;
      if (limit > 0) {
        const { count: tradersWithCidCount, error: tradersWithCidErr } = await supabase
          .from('traders')
          .select('id', { count: 'exact', head: true })
          .not('etoro_cid', 'is', null);
        if (tradersWithCidErr) {
          etoroDebug.traders_with_cid_error = tradersWithCidErr;
        } else {
          etoroDebug.traders_with_cid = tradersWithCidCount || 0;
        }

        const { count: tradersWithCidNeverSyncedCount, error: tradersWithCidNeverSyncedErr } = await supabase
          .from('traders')
          .select('id', { count: 'exact', head: true })
          .not('etoro_cid', 'is', null)
          .is('last_etoro_sync_at', null);
        if (tradersWithCidNeverSyncedErr) {
          etoroDebug.traders_with_cid_never_synced_error = tradersWithCidNeverSyncedErr;
        } else {
          etoroDebug.traders_with_cid_never_synced = tradersWithCidNeverSyncedCount || 0;
        }

        const rawStaleHours = Number(etoro_profiles_stale_hours);
        const staleHours = Math.max(0, Number.isFinite(rawStaleHours) ? rawStaleHours : 24);
        const cutoffIso = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();
        etoroDebug.cutoff_iso = cutoffIso;
        etoroDebug.stale_hours = staleHours;

        const restrictToSpecific = Array.isArray(specific_trader_ids) && specific_trader_ids.length > 0;
        const allowedTraderIdSet = restrictToSpecific ? new Set(allTraderIds) : null;
        etoroDebug.restrict_to_specific = restrictToSpecific;

        const { data: candidateTraders, error: candidatesError } = await supabase
          .from('traders')
          .select('id')
          .not('etoro_cid', 'is', null)
          .or(`last_etoro_sync_at.is.null,last_etoro_sync_at.lt.${cutoffIso}`)
          .order('last_etoro_sync_at', { ascending: true, nullsFirst: true })
          .limit(limit);

        if (candidatesError) {
          console.warn('Warning: failed to fetch etoro profile candidates:', candidatesError);
          etoroDebug.candidates_error = candidatesError;
        } else if (candidateTraders && candidateTraders.length > 0) {
          etoroDebug.candidates_fetched = candidateTraders.length;
          const candidateIds = candidateTraders
            .map((t: any) => t.id)
            .filter((id: string) => (allowedTraderIdSet ? allowedTraderIdSet.has(id) : true));

          etoroDebug.candidates_after_filter = candidateIds.length;

          if (candidateIds.length === 0) {
            // No candidates within the requested subset
          } else {

          // Remove candidates that already have a pending/in_progress etoro_profile job.
          const { data: existingJobs, error: existingError } = await supabase
            .from('sync_jobs')
            .select('trader_id')
            .in('trader_id', candidateIds)
            .eq('job_type', 'etoro_profile')
            .in('status', ['pending', 'in_progress']);

          if (existingError) {
            console.warn('Warning: failed to check existing etoro_profile jobs:', existingError);
            etoroDebug.existing_jobs_error = existingError;
          }

          const existingSet = new Set((existingJobs || []).map((j: any) => j.trader_id));
          etoroDebug.existing_jobs_found = existingSet.size;
          const etoroJobsToInsert = candidateIds
            .filter((id: string) => force || !existingSet.has(id))
            .map((trader_id: string) => ({ trader_id, status: 'pending', job_type: 'etoro_profile' }));

          etoroDebug.jobs_to_insert = etoroJobsToInsert.length;

          if (etoroJobsToInsert.length > 0) {
            const { data: inserted, error: insertEtoroErr } = await supabase
              .from('sync_jobs')
              .insert(etoroJobsToInsert)
              .select('id');

            if (insertEtoroErr) {
              console.warn('Warning: failed inserting etoro_profile jobs:', insertEtoroErr);
              etoroDebug.insert_error = insertEtoroErr;
            } else {
              etoroJobsInserted = inserted?.length || 0;
              etoroDebug.inserted = etoroJobsInserted;
            }
          }
          }
        }
      }
    }

    const { count: pendingCount } = await supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    return new Response(JSON.stringify({
      success: true,
      traders_found: allTraderIds.length,
      jobs_created: actualInserted,
      etoro_profile_jobs_created: etoroJobsInserted,
      ...(debug ? { etoro_profile_debug: etoroDebug } : {}),
      pending_jobs_total: pendingCount || 0
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500
    });
  }
});
