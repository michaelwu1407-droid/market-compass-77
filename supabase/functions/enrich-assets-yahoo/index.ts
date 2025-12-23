import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const DELAY_MS = 500;

// Symbol mapping for international exchanges
function mapSymbolToYahoo(symbol: string): string {
  // Already has a suffix, apply conversions
  if (symbol.includes('.')) {
    const suffixMappings: Record<string, string> = {
      '.ASX': '.AX',
      '.LON': '.L',
      '.PAR': '.PA',
      '.FRA': '.F',
      '.MIL': '.MI',
      '.MAD': '.MC',
      '.AMS': '.AS',
      '.BRU': '.BR',
      '.STO': '.ST',
      '.HEL': '.HE',
      '.OSL': '.OL',
      '.CPH': '.CO',
      '.SWX': '.SW',
      '.TSE': '.TO',
      '.NSE': '.NS',
      '.BSE': '.BO',
    };
    
    for (const [from, to] of Object.entries(suffixMappings)) {
      if (symbol.endsWith(from)) {
        return symbol.replace(from, to);
      }
    }
  }
  
  return symbol;
}

function isCrypto(symbol: string, assetType: string | null): boolean {
  const cryptoSymbols = ['BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'SHIB', 'LTC', 'UNI', 'ATOM', 'XLM'];
  const upperSymbol = symbol.toUpperCase();
  return assetType?.toLowerCase() === 'crypto' || 
         assetType?.toLowerCase() === 'cryptocurrency' ||
         cryptoSymbols.some(c => upperSymbol.includes(c));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchYahooSectorData(symbol: string): Promise<{ sector: string | null; industry: string | null }> {
  const yahooSymbol = mapSymbolToYahoo(symbol);
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}/profile`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.log(`[enrich-assets-yahoo] Failed to fetch ${symbol}: ${response.status}`);
      return { sector: null, industry: null };
    }

    const html = await response.text();
    
    // Parse sector and industry from HTML
    // Look for patterns like "Sector" followed by the sector name
    let sector: string | null = null;
    let industry: string | null = null;

    // Pattern 1: Look for sector in JSON data embedded in page
    const sectorMatch = html.match(/"sector"\s*:\s*"([^"]+)"/i);
    if (sectorMatch) {
      sector = sectorMatch[1];
    }

    const industryMatch = html.match(/"industry"\s*:\s*"([^"]+)"/i);
    if (industryMatch) {
      industry = industryMatch[1];
    }

    // Pattern 2: Look for sector in visible HTML
    if (!sector) {
      const sectorHtmlMatch = html.match(/Sector[^<]*<[^>]*>([^<]+)</i);
      if (sectorHtmlMatch) {
        sector = sectorHtmlMatch[1].trim();
      }
    }

    if (!industry) {
      const industryHtmlMatch = html.match(/Industry[^<]*<[^>]*>([^<]+)</i);
      if (industryHtmlMatch) {
        industry = industryHtmlMatch[1].trim();
      }
    }

    // Pattern 3: Look for data in script tags with JSON
    if (!sector) {
      const jsonMatch = html.match(/root\.App\.main\s*=\s*(\{[\s\S]*?\});/);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          const profile = jsonData?.context?.dispatcher?.stores?.QuoteSummaryStore?.assetProfile;
          if (profile) {
            sector = profile.sector || null;
            industry = profile.industry || null;
          }
        } catch {
          // JSON parsing failed, continue
        }
      }
    }

    console.log(`[enrich-assets-yahoo] ${symbol} -> sector: ${sector}, industry: ${industry}`);
    return { sector, industry };
  } catch (error) {
    console.error(`[enrich-assets-yahoo] Error fetching ${symbol}:`, error);
    return { sector: null, industry: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[enrich-assets-yahoo] Starting sector enrichment...');

    // Get assets without sector data
    const { data: assets, error: fetchError } = await supabase
      .from('assets')
      .select('id, symbol, name, asset_type, sector, industry')
      .is('sector', null)
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    if (!assets || assets.length === 0) {
      console.log('[enrich-assets-yahoo] All assets already have sector data');
      return new Response(JSON.stringify({
        success: true,
        message: 'All assets already enriched',
        enriched: 0,
        remaining: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[enrich-assets-yahoo] Processing ${assets.length} assets...`);

    let enrichedCount = 0;
    let skippedCount = 0;

    for (const asset of assets) {
      // Handle crypto assets
      if (isCrypto(asset.symbol, asset.asset_type)) {
        await supabase
          .from('assets')
          .update({
            sector: 'Cryptocurrency',
            industry: 'Digital Assets',
            updated_at: new Date().toISOString(),
          })
          .eq('id', asset.id);
        
        console.log(`[enrich-assets-yahoo] ${asset.symbol} -> Cryptocurrency (auto-detected)`);
        enrichedCount++;
        continue;
      }

      // Fetch from Yahoo Finance
      const { sector, industry } = await fetchYahooSectorData(asset.symbol);

      if (sector) {
        await supabase
          .from('assets')
          .update({
            sector,
            industry: industry || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', asset.id);
        
        enrichedCount++;
      } else {
        // Mark as "Unknown" to avoid re-processing
        await supabase
          .from('assets')
          .update({
            sector: 'Unknown',
            updated_at: new Date().toISOString(),
          })
          .eq('id', asset.id);
        
        skippedCount++;
      }

      // Rate limiting
      await delay(DELAY_MS);
    }

    // Count remaining assets without sector
    const { count: remaining } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .is('sector', null);

    console.log(`[enrich-assets-yahoo] Completed: ${enrichedCount} enriched, ${skippedCount} skipped, ${remaining || 0} remaining`);

    return new Response(JSON.stringify({
      success: true,
      enriched: enrichedCount,
      skipped: skippedCount,
      remaining: remaining || 0,
      message: remaining && remaining > 0 
        ? `Run again to process ${remaining} more assets`
        : 'All assets enriched',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[enrich-assets-yahoo] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
