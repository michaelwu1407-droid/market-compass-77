import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BULLAWARE_API_KEY = Deno.env.get('BULLAWARE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!BULLAWARE_API_KEY) {
      throw new Error('BULLAWARE_API_KEY is not configured');
    }

    console.log('Starting trader sync from Bullaware API...');

    // Parse request body for optional filters
    let usernames: string[] = [];
    try {
      const body = await req.json();
      usernames = body.usernames || [];
    } catch {
      // No body provided, sync all followed traders
    }

    // Fetch traders from Bullaware API
    const bullwareUrl = usernames.length > 0 
      ? `https://api.bullaware.com/v1/investors?usernames=${usernames.join(',')}`
      : 'https://api.bullaware.com/v1/investors';

    console.log(`Fetching from Bullaware: ${bullwareUrl}`);

    const bullwareResponse = await fetch(bullwareUrl, {
      headers: {
        'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!bullwareResponse.ok) {
      const errorText = await bullwareResponse.text();
      console.error('Bullaware API error:', bullwareResponse.status, errorText);
      throw new Error(`Bullaware API error: ${bullwareResponse.status}`);
    }

    const bullwareData = await bullwareResponse.json();
    console.log(`Received ${bullwareData.data?.length || 0} traders from Bullaware`);

    // Initialize Supabase client with service role for writes
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Map Bullaware data to our traders table schema
    const tradersToUpsert = (bullwareData.data || []).map((trader: any) => ({
      etoro_username: trader.username || trader.userName,
      display_name: trader.displayName || trader.fullName || trader.username,
      avatar_url: trader.avatarUrl || trader.avatar,
      bio: trader.aboutMe || trader.bio || null,
      country: trader.country || null,
      risk_score: trader.riskScore || trader.risk || null,
      gain_12m: trader.gain12Months || trader.yearlyReturn || null,
      gain_24m: trader.gain24Months || null,
      max_drawdown: trader.maxDrawdown || trader.maxDailyDrawdown || null,
      copiers: trader.copiers || trader.copiersCount || 0,
      aum: trader.aum || trader.assetsUnderManagement || null,
      profitable_weeks_pct: trader.profitableWeeksPct || trader.winRatio || null,
      profitable_months_pct: trader.profitableMonthsPct || null,
      avg_trades_per_week: trader.tradesPerWeek || trader.avgTradesPerWeek || null,
      avg_holding_time_days: trader.avgHoldingTime || trader.avgPositionDays || null,
      active_since: trader.activeSince || trader.firstActivity || null,
      verified: trader.verified || trader.isVerified || false,
      tags: trader.tags || trader.tradingStrategy?.split(',') || null,
      updated_at: new Date().toISOString(),
    }));

    console.log(`Upserting ${tradersToUpsert.length} traders to database...`);

    // Upsert traders using etoro_username as unique key
    const { data: upsertedData, error: upsertError } = await supabase
      .from('traders')
      .upsert(tradersToUpsert, { 
        onConflict: 'etoro_username',
        ignoreDuplicates: false 
      })
      .select();

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError);
      throw upsertError;
    }

    console.log(`Successfully synced ${upsertedData?.length || 0} traders`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: upsertedData?.length || 0,
        message: `Successfully synced ${upsertedData?.length || 0} traders from Bullaware`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-traders:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
