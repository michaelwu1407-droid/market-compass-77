import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Domain = 'discussion_feed' | 'trader_profiles' | 'stock_data';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { domain, clear_runs = true, clear_datapoints = true, reset_status = true } = await req.json();

    if (!domain) {
      return new Response(
        JSON.stringify({ success: false, error: 'Domain is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Clearing sync data for domain: ${domain}`);

    const results: Record<string, any> = { domain };

    // Clear datapoints for this domain
    if (clear_datapoints) {
      const { error: dpError } = await supabase
        .from('sync_datapoints')
        .delete()
        .eq('domain', domain);

      if (dpError) {
        console.error('Error clearing datapoints:', dpError);
        results.datapoints_error = dpError.message;
      } else {
        results.datapoints_cleared = true;
      }
    }

    // Clear sync runs for this domain
    if (clear_runs) {
      const { error: runsError } = await supabase
        .from('sync_runs')
        .delete()
        .eq('domain', domain);

      if (runsError) {
        console.error('Error clearing runs:', runsError);
        results.runs_error = runsError.message;
      } else {
        results.runs_cleared = true;
      }
    }

    // Clear logs for this domain
    const { error: logsError } = await supabase
      .from('sync_logs')
      .delete()
      .eq('domain', domain);

    if (logsError) {
      console.error('Error clearing logs:', logsError);
      results.logs_error = logsError.message;
    } else {
      results.logs_cleared = true;
    }

    // Reset domain status to idle
    if (reset_status) {
      const { error: statusError } = await supabase
        .from('sync_domain_status')
        .update({
          status: 'idle',
          current_run_id: null,
          current_stage: null,
          items_total: 0,
          items_completed: 0,
          eta_seconds: null,
          lock_holder: null,
          lock_acquired_at: null,
          last_error_message: null,
          last_error_at: null,
        })
        .eq('domain', domain);

      if (statusError) {
        console.error('Error resetting status:', statusError);
        results.status_error = statusError.message;
      } else {
        results.status_reset = true;
      }
    }

    console.log('Clear sync data results:', results);

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in clear-sync-data:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
