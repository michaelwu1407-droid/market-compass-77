import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const body = await req.json();
    const { trader_id, asset_id, analysis_type = 'comprehensive' } = body;

    if (!trader_id && !asset_id) {
      throw new Error('Either trader_id or asset_id is required');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    let contextData: any = {};
    let entityName = '';

    // Fetch data for analysis context
    if (trader_id) {
      const { data: trader } = await supabase
        .from('traders')
        .select('*')
        .eq('id', trader_id)
        .single();

      const { data: holdings } = await supabase
        .from('trader_holdings')
        .select('*, assets(*)')
        .eq('trader_id', trader_id);

      const { data: performance } = await supabase
        .from('trader_performance')
        .select('*')
        .eq('trader_id', trader_id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(24);

      const { data: recentTrades } = await supabase
        .from('trades')
        .select('*, assets(*)')
        .eq('trader_id', trader_id)
        .order('executed_at', { ascending: false })
        .limit(20);

      contextData = { trader, holdings, performance, recentTrades };
      entityName = trader?.display_name || 'Unknown Trader';

    } else if (asset_id) {
      const { data: asset } = await supabase
        .from('assets')
        .select('*')
        .eq('id', asset_id)
        .single();

      const { data: priceHistory } = await supabase
        .from('price_history')
        .select('*')
        .eq('asset_id', asset_id)
        .order('date', { ascending: false })
        .limit(90);

      const { data: topHolders } = await supabase
        .from('trader_holdings')
        .select('*, traders(*)')
        .eq('asset_id', asset_id)
        .order('allocation_pct', { ascending: false })
        .limit(10);

      contextData = { asset, priceHistory, topHolders };
      entityName = asset?.name || 'Unknown Asset';
    }

    console.log(`Generating ${analysis_type} analysis for ${entityName}`);

    // Build the prompt based on analysis type
    const systemPrompt = `You are an expert investment analyst providing institutional-grade research reports. 
Your analysis should be:
- Data-driven and objective
- Clear about risks and limitations
- Actionable with specific recommendations
- Professional in tone but accessible

Format your response in clear sections with headers.`;

    const userPrompt = trader_id 
      ? `Analyze this eToro copy trader based on their profile and trading data:

TRADER PROFILE:
${JSON.stringify(contextData.trader, null, 2)}

CURRENT HOLDINGS (${contextData.holdings?.length || 0} positions):
${JSON.stringify(contextData.holdings?.slice(0, 10), null, 2)}

MONTHLY PERFORMANCE (last 24 months):
${JSON.stringify(contextData.performance, null, 2)}

RECENT TRADES (last 20):
${JSON.stringify(contextData.recentTrades, null, 2)}

Provide a ${analysis_type} analysis including:
1. Executive Summary (2-3 sentences)
2. Performance Analysis (returns, risk-adjusted metrics, drawdown assessment)
3. Trading Style Assessment (holding period, frequency, sector concentration)
4. Portfolio Risk Analysis (concentration, sector exposure, correlation)
5. Strengths and Weaknesses
6. Recommendation (who should copy this trader, allocation suggestion)
7. Key Risks to Monitor`
      : `Analyze this asset for investment potential:

ASSET DATA:
${JSON.stringify(contextData.asset, null, 2)}

PRICE HISTORY (last 90 days):
${JSON.stringify(contextData.priceHistory?.slice(0, 30), null, 2)}

TOP TRADERS HOLDING THIS ASSET:
${JSON.stringify(contextData.topHolders, null, 2)}

Provide a ${analysis_type} analysis including:
1. Executive Summary
2. Valuation Analysis (PE, EPS, comparison to sector)
3. Technical Analysis (price trends, support/resistance)
4. Fundamental Outlook
5. Who's Investing (what top traders think)
6. Investment Thesis (bull and bear case)
7. Recommendation and Target Price`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const analysisContent = openaiData.choices[0].message.content;

    console.log(`Generated analysis for ${entityName}`);

    // Save report to database
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        title: `${analysis_type.charAt(0).toUpperCase() + analysis_type.slice(1)} Analysis: ${entityName}`,
        content: analysisContent,
        trader_id: trader_id || null,
        asset_id: asset_id || null,
        report_type: analysis_type,
        ai_generated: true,
        status: 'completed',
      })
      .select()
      .single();

    if (reportError) {
      console.error('Error saving report:', reportError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        report_id: report?.id,
        title: report?.title,
        content: analysisContent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyse:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
