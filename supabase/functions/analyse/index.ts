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
    // Use external Supabase project
    const SUPABASE_URL = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const body = await req.json();
    console.log('Received analysis request:', JSON.stringify(body));
    
    // Support both frontend format (traderIds/assets) and direct format (trader_id/asset_id)
    const { 
      trader_id, 
      asset_id, 
      traderIds = [], 
      assets = [],
      reportType = 'comprehensive',
      horizon = '12m',
      extraInstructions = '',
      outputMode = 'full'
    } = body;

    // Resolve trader_id from either direct param or array
    const resolvedTraderId = trader_id || (traderIds.length > 0 ? traderIds[0] : null);
    // Resolve asset from either direct param or assets array (assets may be symbols, not IDs)
    const resolvedAssetSymbol = assets.length > 0 ? assets[0] : null;

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // If we have an asset symbol but not an ID, look it up
    let resolvedAssetId = asset_id;
    if (!resolvedAssetId && resolvedAssetSymbol) {
      const { data: asset } = await supabase
        .from('assets')
        .select('id')
        .eq('symbol', resolvedAssetSymbol.toUpperCase())
        .maybeSingle();
      resolvedAssetId = asset?.id || null;
    }

    if (!resolvedTraderId && !resolvedAssetId) {
      throw new Error('Either a trader or asset must be selected for analysis');
    }

    let contextData: any = {};
    let entityName = '';
    const analysisType = reportType === 'trader_portfolio' ? 'trader' : reportType;

    // Fetch data for analysis context
    if (resolvedTraderId) {
      const { data: trader } = await supabase
        .from('traders')
        .select('*')
        .eq('id', resolvedTraderId)
        .single();

      const { data: holdings } = await supabase
        .from('trader_holdings')
        .select('*, assets(*)')
        .eq('trader_id', resolvedTraderId);

      const { data: performance } = await supabase
        .from('trader_performance')
        .select('*')
        .eq('trader_id', resolvedTraderId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(24);

      const { data: recentTrades } = await supabase
        .from('trades')
        .select('*, assets(*)')
        .eq('trader_id', resolvedTraderId)
        .order('executed_at', { ascending: false })
        .limit(20);

      contextData = { trader, holdings, performance, recentTrades };
      entityName = trader?.display_name || 'Unknown Trader';

    } else if (resolvedAssetId) {
      const { data: asset } = await supabase
        .from('assets')
        .select('*')
        .eq('id', resolvedAssetId)
        .single();

      const { data: priceHistory } = await supabase
        .from('price_history')
        .select('*')
        .eq('asset_id', resolvedAssetId)
        .order('date', { ascending: false })
        .limit(90);

      const { data: topHolders } = await supabase
        .from('trader_holdings')
        .select('*, traders(*)')
        .eq('asset_id', resolvedAssetId)
        .order('allocation_pct', { ascending: false })
        .limit(10);

      contextData = { asset, priceHistory, topHolders };
      entityName = asset?.name || resolvedAssetSymbol || 'Unknown Asset';
    }

    console.log(`Generating ${analysisType} analysis for ${entityName} (horizon: ${horizon})`);

    // Build the prompt based on analysis type
    const systemPrompt = `You are an expert investment analyst providing institutional-grade research reports. 
Your analysis should be:
- Data-driven and objective
- Clear about risks and limitations
- Actionable with specific recommendations
- Professional in tone but accessible

Investment horizon context: ${horizon === '6m' ? '6 months' : horizon === '12m' ? '12 months' : 'Long term (2+ years)'}

Format your response in clear sections with headers.
${extraInstructions ? `\nAdditional focus: ${extraInstructions}` : ''}`;

    const userPrompt = resolvedTraderId 
      ? `Analyze this eToro copy trader based on their profile and trading data:

TRADER PROFILE:
${JSON.stringify(contextData.trader, null, 2)}

CURRENT HOLDINGS (${contextData.holdings?.length || 0} positions):
${JSON.stringify(contextData.holdings?.slice(0, 10), null, 2)}

MONTHLY PERFORMANCE (last 24 months):
${JSON.stringify(contextData.performance, null, 2)}

RECENT TRADES (last 20):
${JSON.stringify(contextData.recentTrades, null, 2)}

Provide a ${outputMode === 'quick' ? 'concise bullet-point summary' : 'comprehensive analysis'} including:
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

Provide a ${outputMode === 'quick' ? 'concise bullet-point summary' : 'comprehensive analysis'} including:
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
        max_tokens: outputMode === 'quick' ? 1000 : 2000,
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
        title: `${analysisType.charAt(0).toUpperCase() + analysisType.slice(1)} Analysis: ${entityName}`,
        content: analysisContent,
        summary: analysisContent.slice(0, 500),
        trader_id: resolvedTraderId || null,
        asset_id: resolvedAssetId || null,
        report_type: analysisType,
        horizon: horizon,
        ai_generated: true,
        status: 'completed',
        input_trader_ids: resolvedTraderId ? [resolvedTraderId] : null,
        input_assets: resolvedAssetSymbol ? [resolvedAssetSymbol] : null,
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
        summary: analysisContent.slice(0, 500),
        content: analysisContent,
        raw_response: analysisContent,
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