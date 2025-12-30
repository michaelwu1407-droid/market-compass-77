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
        const QUEUE_LOW_WATERMARK = 20;
        const FOLLOWED_ENQUEUE_LIMIT = 50;
        const FOLLOWED_STALE_MINUTES = 30;
        const FOLLOWED_BULLAWARE_JOB_TYPES = ['investor_details', 'risk_score', 'metrics', 'portfolio'] as const;
        // Prefer injected env; fall back to request origin to avoid "supabaseUrl is required".
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const body = await req.json().catch(() => ({}));
        const traderId = body?.trader_id ?? body?.traderId ?? null;
        const preferEtoro = body?.prefer_etoro !== false;
        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        // Targeted refresh path (used by TraderDetail "Refresh data")
        // This bypasses the global queue so the UI can update immediately.
        if (traderId) {
            const { data: trader, error: traderErr } = await supabase
                .from('traders')
                .select('id, etoro_username, etoro_cid')
                .eq('id', traderId)
                .maybeSingle();

            if (traderErr || !trader) {
                return new Response(JSON.stringify({
                    success: false,
                    error: traderErr?.message || 'Trader not found',
                }), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const results: Record<string, any> = { trader_id: trader.id };

            if (preferEtoro && (trader.etoro_cid || trader.etoro_username)) {
                const etoroResp = await fetch(`${supabaseUrl}/functions/v1/sync-trader-etoro`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${supabaseAnonKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ cid: trader.etoro_cid ?? null, username: trader.etoro_username ?? null }),
                });
                results.etoro_profile = etoroResp.ok
                    ? await etoroResp.json()
                    : { success: false, error: `HTTP ${etoroResp.status}: ${await etoroResp.text()}` };
            }

            // If eToro didn't provide monthly/equity/portfolio history (it often doesn't),
            // fall back to BullAware investor_details which now best-effort parses those series.
            let performanceCount = 0;
            let equityCount = 0;
            let portfolioHistoryCount = 0;
            try {
                const perf = await supabase
                    .from('trader_performance')
                    .select('*', { count: 'exact', head: true })
                    .eq('trader_id', trader.id);
                performanceCount = perf.count || 0;

                const eq = await supabase
                    .from('trader_equity_history')
                    .select('*', { count: 'exact', head: true })
                    .eq('trader_id', trader.id);
                equityCount = eq.count || 0;

                const ph = await supabase
                    .from('trader_portfolio_history')
                    .select('*', { count: 'exact', head: true })
                    .eq('trader_id', trader.id);
                portfolioHistoryCount = ph.count || 0;
            } catch (_e) {
                // Best-effort only
            }

            const bullAwareJobTypes = [
                ...(preferEtoro && (performanceCount > 0 || equityCount > 0 || portfolioHistoryCount > 0) ? [] : ['investor_details']),
                'risk_score',
                'metrics',
                'portfolio',
                'trades'
            ];
            const bullaware: Array<any> = [];
            for (let i = 0; i < bullAwareJobTypes.length; i++) {
                const job_type = bullAwareJobTypes[i];
                const baResp = await fetch(`${supabaseUrl}/functions/v1/sync-trader-details`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${supabaseAnonKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username: trader.etoro_username, job_type }),
                });
                bullaware.push({
                    job_type,
                    result: baResp.ok
                        ? await baResp.json()
                        : { success: false, error: `HTTP ${baResp.status}: ${await baResp.text()}` },
                });
                if (i < bullAwareJobTypes.length - 1) await sleep(6000);
            }
            results.bullaware = bullaware;

            results.history_counts_before_fallback = {
                trader_performance: performanceCount,
                trader_equity_history: equityCount,
                trader_portfolio_history: portfolioHistoryCount,
                prefer_etoro: preferEtoro,
            };

            return new Response(JSON.stringify({
                success: true,
                mode: 'targeted',
                results,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 1. Invoke dispatch-sync-jobs on same project
        console.log("Invoking dispatch-sync-jobs...");

        // Always keep followed traders fresh by ensuring they have pending work when stale.
        // This prevents needing manual per-trader refresh.
        try {
            const cutoffIso = new Date(Date.now() - FOLLOWED_STALE_MINUTES * 60 * 1000).toISOString();

            const { data: followed, error: followedErr } = await supabase
                .from('user_follows')
                .select('trader_id')
                .order('created_at', { ascending: false })
                .limit(200);

            if (followedErr) {
                console.warn('Warning: failed to load followed traders:', followedErr);
            } else {
                const followedIds = Array.from(new Set((followed || []).map((r: any) => r.trader_id).filter(Boolean)));

                if (followedIds.length > 0) {
                    // Only enqueue for traders that are stale.
                    const { data: staleTraders, error: staleErr } = await supabase
                        .from('traders')
                        .select('id, details_synced_at')
                        .in('id', followedIds)
                        .or(`details_synced_at.is.null,details_synced_at.lt.${cutoffIso}`)
                        .order('details_synced_at', { ascending: true, nullsFirst: true })
                        .limit(FOLLOWED_ENQUEUE_LIMIT);

                    if (staleErr) {
                        console.warn('Warning: failed to load stale followed traders:', staleErr);
                    } else {
                        const staleIds = (staleTraders || []).map((t: any) => t.id).filter(Boolean);
                        if (staleIds.length > 0) {
                            const { data: existing, error: existingErr } = await supabase
                                .from('sync_jobs')
                                .select('trader_id, job_type, status')
                                .in('trader_id', staleIds)
                                .in('job_type', Array.from(FOLLOWED_BULLAWARE_JOB_TYPES))
                                .in('status', ['pending', 'in_progress']);

                            const existingKey = new Set(
                                (existing || []).map((j: any) => `${j.trader_id}:${j.job_type}`)
                            );

                            if (existingErr) {
                                console.warn('Warning: failed checking existing jobs for followed traders:', existingErr);
                            }

                            const jobsToInsert = staleIds.flatMap((trader_id: string) =>
                                Array.from(FOLLOWED_BULLAWARE_JOB_TYPES)
                                    .filter((job_type) => !existingKey.has(`${trader_id}:${job_type}`))
                                    .map((job_type) => ({ trader_id, status: 'pending', job_type }))
                            );

                            if (jobsToInsert.length > 0) {
                                const { error: insertErr } = await supabase
                                    .from('sync_jobs')
                                    .insert(jobsToInsert);

                                if (insertErr) {
                                    console.warn('Warning: failed inserting followed-trader jobs:', insertErr);
                                } else {
                                    console.log(`Enqueued ${jobsToInsert.length} jobs for stale followed traders.`);
                                }
                            }
                        }
                    }
                }
            }
        } catch (e: any) {
            console.warn('Warning: followed-trader enqueue step failed:', e?.message || e);
        }
        
        const dispatchResponse = await fetch(`${supabaseUrl}/functions/v1/dispatch-sync-jobs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        
        let dispatchData = null;
        let dispatchError = null;
        
        if (!dispatchResponse.ok) {
            dispatchError = `HTTP ${dispatchResponse.status}: ${await dispatchResponse.text()}`;
            console.error("Error invoking dispatch-sync-jobs:", dispatchError);
            return new Response(JSON.stringify({ 
                success: false,
                error: dispatchError,
                dispatch_result: null,
                pending_jobs: 0,
                trader_count: 0
            }), { 
                status: 200, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
        }
        
        dispatchData = await dispatchResponse.json();
        console.log("Dispatch result:", dispatchData);

        // 2. Check if queue is empty or low, and if so, refill it
        // Check current pending count
        const { count: currentPending } = await supabase
            .from('sync_jobs')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        
        // Check trader count
        const { count: traderCount } = await supabase
            .from('traders')
            .select('*', { count: 'exact', head: true });
        
        // If trader count is low, log it
        if ((traderCount || 0) < 5000) {
            console.log(`Trader count (${traderCount}) is below 5000. Queue will be refilled from existing traders.`);
        }
        
        // Enqueue only when the queue is genuinely low.
        if ((currentPending || 0) < QUEUE_LOW_WATERMARK) {
            console.log(`Queue is low (${currentPending} pending). Enqueuing more jobs...`);
            try {
                // Call enqueue-sync-jobs on same project
                const enqueueResponse = await fetch(`${supabaseUrl}/functions/v1/enqueue-sync-jobs`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${supabaseAnonKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({}),
                });
                
                if (!enqueueResponse.ok) {
                    const enqueueError = await enqueueResponse.text();
                    console.error("CRITICAL: Error enqueuing jobs:", enqueueError);
                } else {
                    const enqueueData = await enqueueResponse.json();
                    console.log("Enqueue result:", JSON.stringify(enqueueData, null, 2));
                    if (enqueueData && enqueueData.jobs_created === 0) {
                        console.error("CRITICAL: enqueue-sync-jobs returned 0 jobs created. This is a problem!");
                    }
                }
            } catch (e: any) {
                console.error("CRITICAL: Exception enqueuing jobs:", e.message);
            }
        } else {
            console.log(`Queue is healthy (${currentPending} pending jobs).`);
        }
        
        const shouldReschedule = (currentPending || 0) > 0 || (traderCount || 0) < 1000;
        
        if (shouldReschedule) {
            console.log("Work remaining - system should be called again in 2 minutes");
        }
        
        return new Response(JSON.stringify({ 
            message: "Worker ran successfully", 
            dispatch_result: dispatchData,
            pending_jobs: currentPending || 0,
            trader_count: traderCount || 0,
            actions_taken: {
                processed_jobs: dispatchData?.dispatched_jobs || 0,
                triggered_discovery: false,
                refilled_queue: (currentPending || 0) < QUEUE_LOW_WATERMARK
            },
            note: shouldReschedule ? "More work available - call again in 2 minutes" : "Queue is healthy"
        }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });

    } catch (error: any) {
        console.error("Worker error:", error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error?.message || error?.toString() || 'Unknown error',
            dispatch_result: null,
            pending_jobs: 0,
            trader_count: 0
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }
});
