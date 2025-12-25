import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BULLAWARE_BASE = 'https://api.bullaware.com/v1';
const ENDPOINTS = {
  investorDetails: (username: string) => `${BULLAWARE_BASE}/investors/${username}`,
  portfolio: (username: string) => `${BULLAWARE_BASE}/investors/${username}/portfolio`,
  trades: (username: string) => `${BULLAWARE_BASE}/investors/${username}/trades`,
  metrics: (username: string) => `${BULLAWARE_BASE}/investors/${username}/metrics`,
  riskScore: (username: string) => `${BULLAWARE_BASE}/investors/${username}/risk-score/monthly`,
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processTrader(supabase: any, apiKey: string, username: string, traderId: string) {
  // 1. Details
  const detailsRes = await fetch(ENDPOINTS.investorDetails(username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (detailsRes.ok) {
    const data = await detailsRes.json();
    const investor = data.investor || data.data || data;
    await supabase.from('traders').update({
       profitable_weeks_pct: investor.profitableWeeksPct,
       profitable_months_pct: investor.profitableMonthsPct,
       daily_drawdown: investor.dailyDD,
       weekly_drawdown: investor.weeklyDD,
       details_synced_at: new Date().toISOString()
    }).eq('id', traderId);
  }
  await delay(6000); // 6s delay to respect 10 req/min

  // 2. Risk
  const riskRes = await fetch(ENDPOINTS.riskScore(username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (riskRes.ok) {
    const data = await riskRes.json();
    const score = typeof data === 'number' ? data : (data.riskScore || data.points?.[data.points.length-1]?.riskScore);
    if (score) await supabase.from('traders').update({ risk_score: score }).eq('id', traderId);
  }
  await delay(6000); // 6s delay

  // 3. Metrics
  const metricsRes = await fetch(ENDPOINTS.metrics(username), { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (metricsRes.ok) {
    const data = await metricsRes.json();
    const m = data.data || data;
    await supabase.from('traders').update({
       sharpe_ratio: m.sharpeRatio,
       sortino_ratio: m.sortinoRatio,
       alpha: m.alpha,
       beta: m.beta
    }).eq('id', traderId);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bullwareApiKey = Deno.env.get('BULLAWARE_API_KEY');

  if (!bullwareApiKey) {
    return new Response(JSON.stringify({ error: 'BULLAWARE_API_KEY not set' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Fetch 5 PENDING items
    const { data: items, error: fetchError } = await supabase
      .from('sync_queue')
      .select('id, trader_id')
      .eq('status', 'PENDING')
      .limit(5);

    if (fetchError) throw fetchError;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending items' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Mark as PROCESSING
    const ids = items.map((i: any) => i.id);
    await supabase
      .from('sync_queue')
      .update({ status: 'PROCESSING', last_attempted_at: new Date().toISOString() })
      .in('id', ids);

    // 3. Process each
    const results = [];
    for (const item of items) {
      try {
        console.log(`Processing ${item.trader_id}...`);
        
        const { data: trader, error: traderError } = await supabase
          .from('traders')
          .upsert({ etoro_username: item.trader_id, display_name: item.trader_id }, { onConflict: 'etoro_username' })
          .select('id')
          .single();
          
        if (traderError) throw traderError;

        await processTrader(supabase, bullwareApiKey, item.trader_id, trader.id);

        await supabase
          .from('sync_queue')
          .update({ status: 'COMPLETED', error_message: null })
          .eq('id', item.id);
        
        results.push({ id: item.id, status: 'COMPLETED' });

        // Update global sync state for monitoring
        await supabase.from('sync_state').upsert({ 
            id: 'trader_details', 
            last_run: new Date().toISOString(),
            status: 'processing'
        });

      } catch (err) {
        console.error(`Failed ${item.trader_id}:`, err);
        await supabase
          .from('sync_queue')
          .update({ 
            status: 'FAILED', 
            error_message: err instanceof Error ? err.message : 'Unknown error',
            retry_count: 0 
          })
          .eq('id', item.id);
          
        results.push({ id: item.id, status: 'FAILED', error: err });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
