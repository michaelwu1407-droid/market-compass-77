import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();
    if (!job_id) throw new Error('Missing job_id in request body');

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch and claim the job
    const { data: job, error: fetchError } = await supabase
        .from('sync_jobs')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', job_id)
        .select('*, trader:traders(id, etoro_username)')
        .single();

    if (fetchError || !job) {
        console.error(`Job ${job_id} not found or could not be claimed.`, fetchError);
        return new Response(JSON.stringify({ error: `Job ${job_id} not found or could not be claimed.` }), { status: 404 });
    }

    const { trader, job_type } = job;
    if (!trader || !trader.etoro_username) {
        await supabase.from('sync_jobs').update({ status: 'failed', finished_at: new Date().toISOString(), error_message: 'Trader not found for this job.' }).eq('id', job.id);
        throw new Error(`Trader details missing for job ${job.id}`);
    }

    console.log(`Processing ${job_type} for ${trader.etoro_username} (Job ID: ${job.id})`);
    
    const BULLAWARE_API_KEY = Deno.env.get('BULLAWARE_API_KEY');
    if (!BULLAWARE_API_KEY) throw new Error('BULLAWARE_API_KEY is not configured');

    // 2. Execute the sync logic (simplified for now)
    try {
        const response = await fetchWithTimeout(`https://api.bullaware.com/v1/investors/${trader.etoro_username}`,
            { headers: { 'Authorization': `Bearer ${BULLAWARE_API_KEY}` } }
        );

        if (!response.ok) {
            throw new Error(`Bullaware API failed with status: ${response.status}`);
        }
        
        const traderData = await response.json();
        const investor = traderData.investor || traderData.data || traderData;

        const { error: updateError } = await supabase.from('traders').update({
            display_name: investor.displayName || investor.fullName,
            avatar_url: investor.avatarUrl || investor.avatar,
            bio: investor.aboutMe || investor.bio,
            country: investor.country,
            risk_score: investor.riskScore || investor.risk,
            copiers: investor.copiers || investor.copiersCount,
            aum: investor.aum || investor.assetsUnderManagement,
            // ... add all other relevant fields
            updated_at: new Date().toISOString()
        }).eq('id', trader.id);

        if (updateError) throw updateError;

        // 3. Mark job as complete
        await supabase.from('sync_jobs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', job.id);
        console.log(`Successfully processed job ${job.id} for ${trader.etoro_username}`);

        return new Response(JSON.stringify({ success: true, job_id: job.id, message: `Synced ${trader.etoro_username}` }), { headers: corsHeaders });

    } catch (syncError) {
        console.error(`Sync failed for job ${job.id}:`, syncError);
        await supabase.from('sync_jobs').update({ 
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_message: syncError.message 
        }).eq('id', job.id);
        // Re-throw to return a 500 status from the function
        throw syncError;
    }

  } catch (error) {
    console.error("Worker error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
    });
  }
});