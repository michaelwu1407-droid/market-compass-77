import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_TTL_MINUTES = 5; // Same as trigger-sync

type Domain = 'discussion_feed' | 'trader_profiles' | 'stock_data';

interface ClearedLock {
  domain: Domain;
  lock_holder: string;
  lock_acquired_at: string;
  age_minutes: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const body = await req.json().catch(() => ({}));
    const requestedDomains: Domain[] = body.domains || ['discussion_feed', 'trader_profiles', 'stock_data'];
    const clearedBy = body.cleared_by || 'admin';
    
    console.log(`[clear-stale-locks] Checking domains: ${requestedDomains.join(', ')}`);
    
    const staleCutoff = new Date(Date.now() - LOCK_TTL_MINUTES * 60 * 1000).toISOString();
    const cleared: ClearedLock[] = [];
    const skipped: { domain: Domain; reason: string }[] = [];
    
    for (const domain of requestedDomains) {
      // Get current status
      const { data: status, error: fetchError } = await supabase
        .from('sync_domain_status')
        .select('status, lock_holder, lock_acquired_at')
        .eq('domain', domain)
        .maybeSingle();
      
      if (fetchError) {
        console.error(`[clear-stale-locks] Error fetching ${domain}:`, fetchError);
        skipped.push({ domain, reason: `Fetch error: ${fetchError.message}` });
        continue;
      }
      
      if (!status) {
        skipped.push({ domain, reason: 'No status row found' });
        continue;
      }
      
      // Only clear if running AND stale
      if (status.status !== 'running') {
        skipped.push({ domain, reason: `Not running (status: ${status.status})` });
        continue;
      }
      
      if (!status.lock_acquired_at || status.lock_acquired_at > staleCutoff) {
        const ageMinutes = status.lock_acquired_at 
          ? Math.floor((Date.now() - new Date(status.lock_acquired_at).getTime()) / 60000)
          : 0;
        skipped.push({ domain, reason: `Lock is fresh (${ageMinutes} min old, TTL is ${LOCK_TTL_MINUTES} min)` });
        continue;
      }
      
      // Lock is stale - clear it
      const ageMinutes = Math.floor((Date.now() - new Date(status.lock_acquired_at).getTime()) / 60000);
      
      const { error: updateError } = await supabase
        .from('sync_domain_status')
        .update({
          status: 'idle',
          lock_holder: null,
          lock_acquired_at: null,
          last_error_message: `Stale lock cleared by ${clearedBy} (was ${ageMinutes} min old)`,
          last_error_at: new Date().toISOString(),
        })
        .eq('domain', domain);
      
      if (updateError) {
        console.error(`[clear-stale-locks] Error clearing ${domain}:`, updateError);
        skipped.push({ domain, reason: `Update error: ${updateError.message}` });
        continue;
      }
      
      // Log the clearance
      await supabase
        .from('sync_logs')
        .insert({
          domain,
          level: 'warn',
          message: `Stale lock manually cleared by ${clearedBy} (was held by ${status.lock_holder} for ${ageMinutes} min)`,
          details: {
            cleared_by: clearedBy,
            previous_holder: status.lock_holder,
            lock_acquired_at: status.lock_acquired_at,
            age_minutes: ageMinutes,
            ttl_minutes: LOCK_TTL_MINUTES,
          },
        });
      
      cleared.push({
        domain,
        lock_holder: status.lock_holder,
        lock_acquired_at: status.lock_acquired_at,
        age_minutes: ageMinutes,
      });
      
      console.log(`[clear-stale-locks] Cleared stale lock for ${domain} (was ${ageMinutes} min old)`);
    }
    
    return new Response(JSON.stringify({
      success: true,
      cleared,
      skipped,
      ttl_minutes: LOCK_TTL_MINUTES,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error('[clear-stale-locks] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
