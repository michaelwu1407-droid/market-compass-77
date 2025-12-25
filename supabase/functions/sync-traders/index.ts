import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CROSS_CHECK_FIELDS = ['risk_score', 'copiers', 'gain_12m', 'gain_24m', 'max_drawdown'];
const DISCREPANCY_THRESHOLD_PCT = 5;

interface DiscrepancyLog {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  field_name: string;
  bullaware_value: string | null;
  firecrawl_value: string | null;
  difference_pct: number | null;
  value_used: string;
}

function checkDiscrepancy(
  field: string, 
  bullaware: any, 
  firecrawl: any,
  entityId: string,
  entityName: string
): DiscrepancyLog | null {
  if (bullaware === null || bullaware === undefined || firecrawl === null || firecrawl === undefined) {
    return null;
  }

  const bValue = parseFloat(String(bullaware));
  const fValue = parseFloat(String(firecrawl));

  if (isNaN(bValue) || isNaN(fValue)) {
    if (String(bullaware) !== String(firecrawl)) {
      return {
        entity_type: 'trader',
        entity_id: entityId,
        entity_name: entityName,
        field_name: field,
        bullaware_value: String(bullaware),
        firecrawl_value: String(firecrawl),
        difference_pct: null,
        value_used: 'bullaware',
      };
    }
  } else {
    if (bValue === 0 && fValue === 0) return null;

    const diffPct = bValue !== 0
      ? Math.abs((bValue - fValue) / bValue * 100)
      : (fValue !== 0 ? 100.0 : 0);

    if (diffPct > DISCREPANCY_THRESHOLD_PCT) {
      return {
        entity_type: 'trader',
        entity_id: entityId,
        entity_name: entityName,
        field_name: field,
        bullaware_value: String(bValue),
        firecrawl_value: String(fValue),
        difference_pct: Math.round(diffPct * 100) / 100,
        value_used: 'bullaware',
      };
    }
  }
  return null;
}

async function scrapeTraderFromEtoro(username: string, firecrawlApiKey: string): Promise<any | null> {
  try {
    const url = `https://www.etoro.com/people/${username}`;
    console.log(`Scraping eToro profile: ${url}`);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });

    if (!response.ok) {
      console.error(`Firecrawl error for ${username}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';

    const parsed: any = {};
    const riskMatch = markdown.match(/risk\s*(?:score)?[:\s]*(\d+)/i);
    if (riskMatch) parsed.risk_score = parseInt(riskMatch[1]);

    const copiersMatch = markdown.match(/(\d+(?:,\d+)*)\s*copiers/i);
    if (copiersMatch) parsed.copiers = parseInt(copiersMatch[1].replace(/,/g, ''));

    const return12mMatch = markdown.match(/(?:12\s*(?:mo?n?th?s?|M))[:\s]*([-+]?\d+(?:\.\d+)?)\s*%/i);
    if (return12mMatch) parsed.gain_12m = parseFloat(return12mMatch[1]);

    const return24mMatch = markdown.match(/(?:24\s*(?:mo?n?th?s?|M))[:\s]*([-+]?\d+(?:\.\d+)?)\s*%/i);
    if (return24mMatch) parsed.gain_24m = parseFloat(return24mMatch[1]);

    const drawdownMatch = markdown.match(/(?:max\s*)?draw\s*down[:\s]*([-+]?\d+(?:\.\d+)?)\s*%?/i);
    if (drawdownMatch) parsed.max_drawdown = parseFloat(drawdownMatch[1]);

    console.log(`Scraped data for ${username}:`, parsed);
    return parsed;

  } catch (error) {
    console.error(`Error scraping ${username}:`, error);
    return null;
  }
}

function parseAum(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/[$,+]/g, '').trim();
  const match = str.match(/^[\d.]+([KMB])?$/i);
  if (!match) return null;
  let num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'K') num *= 1000;
  if (suffix === 'M') num *= 1000000;
  if (suffix === 'B') num *= 1000000000;
  return num;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BULLAWARE_API_KEY = Deno.env.get('BULLAWARE_API_KEY');
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!BULLAWARE_API_KEY) {
      throw new Error('BULLAWARE_API_KEY is not configured');
    }

    let usernames: string[] = [];
    let enableCrossCheck = false;
    let force = false;
    
    try {
      const body = await req.json();
      usernames = body.usernames || [];
      enableCrossCheck = body.enableCrossCheck ?? false;
      force = body.force ?? false;
    } catch {
      // No body
    }

    const hasFirecrawl = !!FIRECRAWL_API_KEY && enableCrossCheck;
    console.log(`Starting trader sync. Cross-checking enabled: ${hasFirecrawl}, Force: ${force}`);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    let allBullwareTraders: any[] = [];

    if (usernames.length > 0) {
      const bullwareUrl = `https://api.bullaware.com/v1/investors?usernames=${usernames.join(',')}`;
      console.log(`Fetching specific traders from Bullaware: ${bullwareUrl}`);
      
      const response = await fetch(bullwareUrl, {
        headers: {
          'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Bullaware API error: ${response.status}`);
      }
      
      const data = await response.json();
      allBullwareTraders = data.items || data.data || data.investors || (Array.isArray(data) ? data : []);
    } else {
      // Fetch the top 1000 traders (increased from 100)
      const bullwareUrl = `https://api.bullaware.com/v1/investors?limit=1000`;
      console.log(`Fetching top traders from Bullaware: ${bullwareUrl}`);
      
      const response = await fetch(bullwareUrl, {
        headers: {
          'Authorization': `Bearer ${BULLAWARE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Bullaware API error: ${response.status}`);
      }
      
      const data = await response.json();
      allBullwareTraders = data.items || data.data || data.investors || (Array.isArray(data) ? data : []);
    }

    console.log(`Total traders from Bullaware: ${allBullwareTraders.length}`);

    const discrepancies: DiscrepancyLog[] = [];
    const tradersToUpsert: any[] = [];

    for (const trader of allBullwareTraders) {
      const username = trader.username || trader.userName;
      
      const bullwareRecord = {
        etoro_username: username,
        display_name: trader.displayName || trader.fullName || trader.fullname || username,
        avatar_url: trader.avatarUrl || trader.avatar,
        bio: trader.aboutMe || trader.bio || null,
        country: trader.country || null,
        risk_score: trader.riskScore || trader.risk || null,
        gain_12m: trader.gain12Months || trader.return1Year || trader.yearlyReturn || null,
        gain_24m: trader.gain24Months || trader.return2Years || null,
        max_drawdown: trader.maxDrawdown || trader.maxDailyDrawdown || trader.dailyDD || null,
        copiers: trader.copiers || trader.copiersCount || 0,
        aum: parseAum(trader.aum || trader.assetsUnderManagement),
        profitable_weeks_pct: trader.profitableWeeksPct || trader.winRatio || null,
        profitable_months_pct: trader.profitableMonthsPct || null,
        avg_trades_per_week: trader.tradesPerWeek || trader.avgTradesPerWeek || null,
        avg_holding_time_days: trader.avgHoldingTime || trader.avgPositionDays || null,
        active_since: trader.activeSince || trader.firstActivity || null,
        verified: trader.verified || trader.isVerified || false,
        tags: trader.tags || trader.investsIn || null,
        updated_at: new Date().toISOString(),
      };

      if (hasFirecrawl) {
        const firecrawlData = await scrapeTraderFromEtoro(username, FIRECRAWL_API_KEY!);
        
        if (firecrawlData) {
          const { data: existingTrader } = await supabase
            .from('traders')
            .select('id')
            .eq('etoro_username', username)
            .maybeSingle();
          
          const traderId = existingTrader?.id || 'pending';

          for (const field of CROSS_CHECK_FIELDS) {
            const bullValue = (bullwareRecord as any)[field];
            const fireValue = firecrawlData[field];
            
            const discrepancy = checkDiscrepancy(field, bullValue, fireValue, traderId, username);
            if (discrepancy) {
              discrepancies.push(discrepancy);
              console.log(`Discrepancy found for ${username}.${field}: Bullaware=${bullValue}, Firecrawl=${fireValue}`);
            }
          }
        }
      }

      tradersToUpsert.push(bullwareRecord);
    }

    console.log(`Upserting ${tradersToUpsert.length} traders...`);
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

    if (discrepancies.length > 0) {
      for (const disc of discrepancies) {
        if (disc.entity_id === 'pending') {
          const trader = upsertedData?.find(t => t.etoro_username === disc.entity_name);
          if (trader) disc.entity_id = trader.id;
        }
      }

      console.log(`Logging ${discrepancies.length} discrepancies...`);
      const { error: discError } = await supabase
        .from('data_discrepancies')
        .insert(discrepancies);

      if (discError) {
        console.error('Error logging discrepancies:', discError);
      }
    }

    console.log(`Successfully synced ${upsertedData?.length || 0} traders, logged ${discrepancies.length} discrepancies`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: upsertedData?.length || 0,
        discrepancies_logged: discrepancies.length,
        cross_checking_enabled: hasFirecrawl,
        message: `Synced ${upsertedData?.length || 0} traders${hasFirecrawl ? ` with cross-check, found ${discrepancies.length} discrepancies` : ' (quick mode)'}`,
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
