import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process jobs sequentially to respect Bullaware API rate limit (10 req/min)
// Optimized: 1 job every 6 seconds = exactly 10 req/min (using full capacity)
const MAX_JOBS_TO_PROCESS = 10; // Process 10 jobs per batch = 1 minute per batch
const DELAY_BETWEEN_JOBS_MS = 6000; // 6 seconds = exactly 10 req/min

const LOCK_DOMAIN = 'dispatch_sync_jobs';
const LOCK_TTL_MINUTES = 5;

async function acquireLock(supabase: any, lockHolder: string) {
    const staleCutoff = new Date(Date.now() - LOCK_TTL_MINUTES * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: current, error: fetchError } = await supabase
        .from('sync_domain_status')
        .select('status, lock_holder, lock_acquired_at')
        .eq('domain', LOCK_DOMAIN)
        .maybeSingle();

    if (fetchError) throw fetchError;

    if (!current) {
        const { error: insertError } = await supabase
            .from('sync_domain_status')
            .insert({ domain: LOCK_DOMAIN, status: 'running', lock_holder: lockHolder, lock_acquired_at: now });
        if (insertError) throw insertError;
        return { acquired: true, reason: 'row_initialized' as const };
    }

    const lockAcquiredAt = current.lock_acquired_at;
    const lockAgeMinutes = lockAcquiredAt
        ? Math.floor((Date.now() - new Date(lockAcquiredAt).getTime()) / 60000)
        : 0;
    const isStale = lockAcquiredAt && lockAcquiredAt < staleCutoff;

    if (current.status === 'running' && !isStale) {
        return {
            acquired: false,
            reason: 'already_running' as const,
            lockHolder: current.lock_holder,
            lockAcquiredAt,
            lockAgeMinutes,
        };
    }

    if (current.status === 'running' && isStale) {
        await supabase.from('sync_logs').insert({
            domain: LOCK_DOMAIN,
            level: 'warn',
            message: `Stale dispatch lock auto-cleared (was held by ${current.lock_holder} for ${lockAgeMinutes} min, TTL is ${LOCK_TTL_MINUTES} min)`,
            details: { previous_holder: current.lock_holder, lock_acquired_at: lockAcquiredAt, age_minutes: lockAgeMinutes },
        });
    }

    const { data: updated, error: updateError } = await supabase
        .from('sync_domain_status')
        .update({ status: 'running', lock_holder: lockHolder, lock_acquired_at: now })
        .eq('domain', LOCK_DOMAIN)
        .select()
        .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) throw new Error('Failed to acquire lock (no row returned)');
    return { acquired: true, reason: isStale ? 'stale_cleared' as const : 'success' as const };
}

async function releaseLock(supabase: any, status: 'idle' | 'error', errorMessage?: string) {
    const updates: Record<string, any> = {
        status,
        lock_holder: null,
        lock_acquired_at: null,
    };
    if (status === 'idle') {
        updates.last_successful_at = new Date().toISOString();
    }
    if (errorMessage) {
        updates.last_error_message = errorMessage;
        updates.last_error_at = new Date().toISOString();
    }
    await supabase.from('sync_domain_status').update(updates).eq('domain', LOCK_DOMAIN);
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const invocationId = crypto.randomUUID();

    try {
        // Use native SUPABASE_URL - functions are deployed on this project
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        // Prefer passing through the caller's auth headers (more reliable than env in some deployments)
        const callerAuth = req.headers.get('authorization') || '';
        const callerApiKey = req.headers.get('apikey') || '';
        const forwardedAuth = callerAuth || `Bearer ${supabaseAnonKey}`;
        const forwardedApiKey = callerApiKey || supabaseAnonKey;
        
                const supabase = createClient(supabaseUrl, supabaseServiceKey);

                const lockHolder = req.headers.get('x-dispatch-invocation') || `dispatch-sync-jobs:${invocationId}`;
                const lock = await acquireLock(supabase, lockHolder);

                if (!lock.acquired) {
                    await supabase.from('sync_logs').insert({
                        domain: LOCK_DOMAIN,
                        level: 'info',
                        message: `Skipped dispatch: already running (holder=${lock.lockHolder}, age=${lock.lockAgeMinutes}m)`,
                        details: { invocation_id: invocationId, lock },
                    });

                    return new Response(JSON.stringify({
                        success: true,
                        message: 'Dispatch already running; skipping to prevent overlap.',
                        dispatched_jobs: 0,
                        attempted: 0,
                        errors: [],
                        lock,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 200,
                    });
                }

        console.log(`[${invocationId}] Searching for pending jobs...`);

        // Also reset stuck in_progress jobs (older than 10 minutes) before fetching
        const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { error: resetError } = await supabase
            .from('sync_jobs')
            .update({ status: 'pending', started_at: null })
            .eq('status', 'in_progress')
            .lt('started_at', stuckThreshold);
        
        if (resetError) {
            console.warn("Warning: Error resetting stuck jobs (non-fatal):", resetError);
        }

        const { data: pendingJobs, error: fetchError } = await supabase
            .from('sync_jobs')
            .select('id, status')
            .eq('status', 'pending')
            .order('created_at', { ascending: true }) // Process oldest first
            .limit(MAX_JOBS_TO_PROCESS); // Process up to 10 jobs per call (with 7s delays = ~1.4 min per batch)

        if (fetchError) {
            console.error("Error fetching pending jobs:", fetchError);
            throw fetchError;
        }

        console.log(`[${invocationId}] Found ${pendingJobs?.length} pending jobs.`);

        if (!pendingJobs || pendingJobs.length === 0) {
            // Double-check with a count query
            const { count, error: countError } = await supabase
                .from('sync_jobs')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');
            
            console.log(`[DEBUG] Count query: ${count} pending jobs, error:`, countError);
            
            if (count && count > 0) {
                // There are pending jobs but select returned none - might be a query issue
                console.error(`[DEBUG] Mismatch: Count shows ${count} pending but select returned 0. Checking query...`);
                // Try without limit
                const { data: allPending, error: allPendingError } = await supabase
                    .from('sync_jobs')
                    .select('id, status, created_at')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: true });
                console.log(`[DEBUG] All pending jobs query:`, allPending?.length, 'error:', allPendingError);
            }
            
        return new Response(JSON.stringify({ 
            message: "No pending jobs to dispatch.", 
            total_jobs: count,
            dispatched_jobs: 0,
            attempted: 0,
            errors: [],
            debug: { count, countError }
        }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });
        }

        // Process jobs sequentially to respect Bullaware API rate limit (10 req/min)
        let invokedCount = 0;
        const errors: any[] = []; // Collect errors

                for (let i = 0; i < pendingJobs.length; i++) {
            const job = pendingJobs[i];
                        console.log(`[${invocationId}] Processing job ${i + 1}/${pendingJobs.length}: ${job.id}`);
            
            try {
                                // Claim the job first to avoid duplicate processing if another dispatch overlaps
                                const { data: claimed, error: claimError } = await supabase
                                    .from('sync_jobs')
                                    .update({ status: 'in_progress', started_at: new Date().toISOString() })
                                    .eq('id', job.id)
                                    .eq('status', 'pending')
                                    .select('id')
                                    .maybeSingle();

                                if (claimError) {
                                    console.error(`[${invocationId}] Error claiming job ${job.id}:`, claimError);
                                    errors.push({ job_id: job.id, error: `Claim error: ${claimError.message}` });
                                    if (i < pendingJobs.length - 1) {
                                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOBS_MS));
                                    }
                                    continue;
                                }

                                if (!claimed) {
                                    console.log(`[${invocationId}] Job ${job.id} was already claimed; skipping.`);
                                    continue;
                                }

                // Call process-sync-job on same project (native SUPABASE_URL)
                const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-sync-job`, {
                    method: 'POST',
                    headers: {
                        'Authorization': forwardedAuth,
                        'apikey': forwardedApiKey,
                        'Content-Type': 'application/json',
                                                'x-dispatch-invocation': invocationId,
                    },
                    body: JSON.stringify({ job_id: job.id }),
                });
                
                let result = null;
                let invokeError = null;
                
                if (!processResponse.ok) {
                    invokeError = { message: `HTTP ${processResponse.status}: ${await processResponse.text()}` };
                } else {
                    result = await processResponse.json();
                }
                
                if (invokeError) {
                    // Supabase function invocation error (network, auth, etc.)
                    const errorMsg = typeof invokeError === 'string' ? invokeError : (invokeError.message || JSON.stringify(invokeError));
                    console.error(`Failed to invoke process-sync-job for job ${job.id}:`, errorMsg);
                    errors.push({ job_id: job.id, error: `Invocation error: ${errorMsg}` });
                                        await supabase.from('sync_logs').insert({
                                            domain: LOCK_DOMAIN,
                                            level: 'error',
                                            message: `Invocation error for job ${job.id}: ${errorMsg}`,
                                            details: { invocation_id: invocationId, job_id: job.id },
                                        });
                } else if (result && (result.error || result.success === false)) {
                    // Function returned successfully but with an error in the response
                    const errorMsg = result.error || 'Process failed';
                    console.error(`process-sync-job returned error for job ${job.id}:`, errorMsg);
                    errors.push({ job_id: job.id, error: errorMsg, details: result.details });
                                        await supabase.from('sync_logs').insert({
                                            domain: LOCK_DOMAIN,
                                            level: 'error',
                                            message: `process-sync-job returned error for job ${job.id}: ${errorMsg}`,
                                            details: { invocation_id: invocationId, job_id: job.id, result },
                                        });
                } else if (result && result.success !== false) {
                    // Success
                    invokedCount++;
                    console.log(`Successfully processed job ${job.id}`);
                } else {
                    // Unknown response format
                    console.warn(`process-sync-job returned unexpected response for job ${job.id}:`, result);
                    invokedCount++; // Assume success if no error
                }
                
                // Add delay between jobs to respect rate limit (except for last job)
                if (i < pendingJobs.length - 1) {
                    console.log(`Waiting ${DELAY_BETWEEN_JOBS_MS}ms before next job to respect API rate limit...`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOBS_MS));
                }
            } catch (err: any) {
                // Catch any unexpected errors
                const errorMsg = err?.message || err?.toString() || JSON.stringify(err);
                console.error(`Exception invoking process-sync-job for job ${job.id}:`, errorMsg);
                errors.push({ job_id: job.id, error: `Exception: ${errorMsg}` });
                                await supabase.from('sync_logs').insert({
                                    domain: LOCK_DOMAIN,
                                    level: 'error',
                                    message: `Exception processing job ${job.id}: ${errorMsg}`,
                                    details: { invocation_id: invocationId, job_id: job.id },
                                });
                
                // Still add delay even on error to respect rate limits
                if (i < pendingJobs.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOBS_MS));
                }
            }
        }

                console.log(`[${invocationId}] Dispatched ${invokedCount} of ${pendingJobs.length} pending jobs.`);

                await supabase.from('sync_logs').insert({
                    domain: LOCK_DOMAIN,
                    level: 'info',
                    message: `Dispatch finished: dispatched=${invokedCount} attempted=${pendingJobs.length} errors=${errors.length}`,
                    details: { invocation_id: invocationId, dispatched: invokedCount, attempted: pendingJobs.length, errors_count: errors.length },
                });

                await releaseLock(supabase, 'idle');

        return new Response(JSON.stringify({ 
            success: true, 
            dispatched_jobs: invokedCount,
            attempted: pendingJobs.length,
            errors: errors // Return errors in response
        }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });

    } catch (error: any) {
        console.error("Dispatch error:", error);
        // Always return 200 with error details instead of 500, so force-process-queue can continue
        return new Response(JSON.stringify({ 
            success: false,
            error: error?.message || error?.toString() || 'Unknown error',
            dispatched_jobs: 0,
            attempted: 0,
            errors: [{ error: error?.message || error?.toString() || 'Unknown error' }]
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200, // Return 200 so caller can see the error details
        });
    }
});
