import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { yahooSymbolCandidates } from "../_shared/yahooSymbol.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface YahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
}

type BullawareQuote = {
  symbol: string;
  price?: number;
  change?: number;
  changePct?: number;
};

type AssetRow = {
  id: string;
  symbol: string;
  name: string;
  asset_type?: string | null;
  exchange?: string | null;
  country?: string | null;
  currency?: string | null;
  sector?: string | null;
};

function yahooCandidatesForAsset(asset: AssetRow): string[] {
  return yahooSymbolCandidates({
    symbol: asset.symbol,
    exchange: asset.exchange ?? null,
    country: asset.country ?? null,
    currency: asset.currency ?? null,
    asset_type: asset.asset_type ?? null,
    sector: asset.sector ?? null,
  });
}

async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const results = new Map<string, YahooQuote>();

  if (symbols.length === 0) {
    return results;
  }

  // Yahoo's v7 quote endpoint is returning 401 from the Supabase edge runtime.
  // The v8 chart endpoint is currently reachable (HTTP 200) and provides both current price
  // and previous close in `meta`, but it requires per-symbol requests.
  const concurrency = 5;

  const fetchOne = async (symbol: string): Promise<void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol,
      )}?interval=1d&range=2d`;

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://finance.yahoo.com/",
        },
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return;

      const currentPrice = Number(meta.regularMarketPrice);
      const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);
      if (!Number.isFinite(currentPrice) || !Number.isFinite(previousClose) || previousClose <= 0) {
        return;
      }

      const priceChange = currentPrice - previousClose;
      const priceChangePercent = (priceChange / previousClose) * 100;

      results.set(symbol.toUpperCase(), {
        symbol,
        regularMarketPrice: currentPrice,
        regularMarketChange: priceChange,
        regularMarketChangePercent: priceChangePercent,
        regularMarketPreviousClose: previousClose,
      });
    } catch {
      // ignore
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Simple async pool
  const queue = symbols.slice();
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }).map(async () => {
    while (queue.length > 0) {
      const sym = queue.shift();
      if (!sym) return;
      await fetchOne(sym);
    }
  });

  await Promise.all(workers);
  return results;
}

async function fetchBullawareQuotes(symbols: string[]): Promise<Map<string, BullawareQuote>> {
  const results = new Map<string, BullawareQuote>();
  const apiKey = Deno.env.get('BULLAWARE_API_KEY');
  if (!apiKey || symbols.length === 0) {
    return results;
  }

  const requestedSymbols = new Set(
    symbols
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean),
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    // IMPORTANT: BullAware expects a comma-separated list (unescaped commas), as used by sync-assets.
    const url = `https://api.bullaware.com/v1/instruments?symbols=${symbols.join(',')}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[fetch-daily-prices] BullAware API error (batch): ${response.status}`);
      return results;
    }

    const data = await response.json();
    const items: any[] = data?.items || data?.data || data?.instruments || (Array.isArray(data) ? data : []);

    // If BullAware ignores our filter, it may return a default page (e.g. FX pairs).
    // Prevent writing incorrect prices by requiring at least one overlap with the requested set.
    let overlap = 0;
    for (const item of items) {
      const sym = String(item?.symbol || item?.ticker || '').trim().toUpperCase();
      if (sym && requestedSymbols.has(sym)) {
        overlap++;
        break;
      }
    }
    if (items.length > 0 && overlap === 0) {
      console.log(
        `[fetch-daily-prices] BullAware returned ${items.length} items but none matched requested symbols; treating as unfiltered response`,
      );
      return results;
    }

    for (const item of items) {
      const symbol = String(item?.symbol || item?.ticker || '').trim().toUpperCase();
      if (!symbol) continue;

      const price = Number(item?.price ?? item?.lastPrice ?? item?.rate ?? item?.value ?? item?.currentPrice ?? item?.current_price);
      const change = Number(item?.change ?? item?.priceChange ?? item?.price_change);
      const changePct = Number(item?.changePct ?? item?.changePercent ?? item?.change_pct ?? item?.priceChangePct ?? item?.price_change_pct);

      results.set(symbol, {
        symbol,
        price: Number.isFinite(price) ? price : undefined,
        change: Number.isFinite(change) ? change : undefined,
        changePct: Number.isFinite(changePct) ? changePct : undefined,
      });
    }

    return results;
  } catch (error) {
    console.log(`[fetch-daily-prices] Error fetching quotes (BullAware batch):`, error);
    return results;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchBullawareDefaultQuotes(): Promise<Map<string, BullawareQuote>> {
  const results = new Map<string, BullawareQuote>();
  const apiKey = Deno.env.get('BULLAWARE_API_KEY');
  if (!apiKey) {
    return results;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    // Some BullAware deployments appear to ignore the symbols filter and only return a small default
    // set of instruments. We still use that set as a reliable fallback for daily price change data.
    const url = `https://api.bullaware.com/v1/instruments?limit=100`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[fetch-daily-prices] BullAware API error (default): ${response.status}`);
      return results;
    }

    const data = await response.json();
    const items: any[] = data?.items || data?.data || data?.instruments || (Array.isArray(data) ? data : []);

    for (const item of items) {
      const symbol = String(item?.symbol || item?.ticker || '').trim().toUpperCase();
      if (!symbol) continue;

      const price = Number(item?.price ?? item?.lastPrice ?? item?.rate ?? item?.value ?? item?.currentPrice ?? item?.current_price);
      const change = Number(item?.change ?? item?.priceChange ?? item?.price_change);
      const changePct = Number(item?.changePct ?? item?.changePercent ?? item?.change_pct ?? item?.priceChangePct ?? item?.price_change_pct);

      results.set(symbol, {
        symbol,
        price: Number.isFinite(price) ? price : undefined,
        change: Number.isFinite(change) ? change : undefined,
        changePct: Number.isFinite(changePct) ? changePct : undefined,
      });
    }

    return results;
  } catch (error) {
    console.log(`[fetch-daily-prices] Error fetching quotes (BullAware default):`, error);
    return results;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const urlObj = new URL(req.url);

    let body: any = {};
    if (req.method !== 'GET') {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const debugFailed =
      urlObj.searchParams.get('debug_failed') === '1' ||
      urlObj.searchParams.get('debug') === '1' ||
      body?.debug_failed === true ||
      body?.debug === true;

    const failedLimitRaw =
      urlObj.searchParams.get('failed_limit') ??
      urlObj.searchParams.get('limit') ??
      body?.failed_limit ??
      body?.limit;
    const failedLimit = Math.min(
      500,
      Math.max(0, Number.parseInt(String(failedLimitRaw ?? '100'), 10) || 100),
    );

    const dryRun =
      urlObj.searchParams.get('dry_run') === '1' ||
      body?.dry_run === true ||
      body?.dryRun === true;

    const maxAssetsRaw =
      urlObj.searchParams.get('max_assets') ??
      body?.max_assets ??
      body?.maxAssets;
    const maxAssets = maxAssetsRaw === undefined || maxAssetsRaw === null
      ? null
      : Math.max(0, Number.parseInt(String(maxAssetsRaw), 10) || 0);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Probe should work even if Yahoo is blocked.
    if (urlObj.searchParams.get('probe') === '1') {
      const { data: sampleAssets } = await supabase
        .from('assets')
        .select('symbol')
        .not('symbol', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(10);

      const sampleSymbols = (sampleAssets || []).map((a: any) => String(a.symbol)).filter(Boolean).slice(0, 5);
      const probeSymbols = Array.from(new Set(['AAPL', '0700.HK', 'BTC-USD', ...sampleSymbols]));

      const yahoo = await fetchYahooQuotes(probeSymbols);
      const bull = await fetchBullawareQuotes(probeSymbols);
      const bullDefault = await fetchBullawareDefaultQuotes();

      // Extra diagnostics: see if Yahoo is returning HTML/captcha/blocked responses.
      let yahooHttpStatus: number | null = null;
      let yahooBodyPrefix: string | null = null;
      let yahooChartStatus: number | null = null;
      let yahooChartBodyPrefix: string | null = null;
      try {
        const diagUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
          ['AAPL', 'BTC-USD'].join(','),
        )}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(diagUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://finance.yahoo.com/",
          },
        });
        yahooHttpStatus = res.status;
        const bodyText = await res.text();
        yahooBodyPrefix = bodyText.slice(0, 200);
        clearTimeout(timeoutId);
      } catch {
        // ignore
      }

      // Also try the v8 chart endpoint (historically less restricted than quote).
      try {
        const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          'AAPL',
        )}?interval=1d&range=2d`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(chartUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://finance.yahoo.com/",
          },
        });
        yahooChartStatus = res.status;
        const bodyText = await res.text();
        yahooChartBodyPrefix = bodyText.slice(0, 200);
        clearTimeout(timeoutId);
      } catch {
        // ignore
      }

      return new Response(
        JSON.stringify({
          success: true,
          probeSymbols,
          yahooCount: yahoo.size,
          bullawareCount: bull.size,
          bullawareDefaultCount: bullDefault.size,
          yahooHttpStatus,
          yahooBodyPrefix,
          yahooChartStatus,
          yahooChartBodyPrefix,
          sampleYahoo: Array.from(yahoo.values()).slice(0, 3),
          sampleBullaware: Array.from(bull.values()).slice(0, 3),
          sampleBullawareDefault: Array.from(bullDefault.values()).slice(0, 3),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const yahooProbe = await fetchYahooQuotes(['AAPL']);
    const yahooAvailable = yahooProbe.size > 0;
    if (!yahooAvailable) {
      console.log('[fetch-daily-prices] Yahoo appears unavailable from edge runtime; using BullAware default fallback');

      const bullDefault = await fetchBullawareDefaultQuotes();
      const bullSymbols = Array.from(bullDefault.keys());

      if (bullSymbols.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            updated: 0,
            failed: 0,
            total: 0,
            yahoo_updated: 0,
            bullaware_updated: 0,
            message: 'No BullAware quotes available and Yahoo unavailable',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: assets, error: assetsError } = await supabase
        .from('assets')
        .select('id, symbol')
        .in('symbol', bullSymbols);

      if (assetsError) {
        console.error('[fetch-daily-prices] Error fetching assets for BullAware fallback:', assetsError);
        throw assetsError;
      }

      let updated = 0;
      let failed = 0;

      for (const asset of assets || []) {
        const sym = String((asset as any).symbol || '').trim().toUpperCase();
        const quote = bullDefault.get(sym);
        if (quote?.price === undefined) continue;

        const { error: updateError } = await supabase
          .from('assets')
          .update({
            current_price: quote.price,
            price_change: quote.change ?? 0,
            price_change_pct: quote.changePct ?? 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (asset as any).id);

        if (updateError) {
          failed++;
        } else {
          updated++;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          updated,
          failed,
          total: (assets || []).length,
          yahoo_updated: 0,
          bullaware_updated: updated,
          bullaware_default_count: bullDefault.size,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('[fetch-daily-prices] Starting daily price fetch...');

    // Get assets that look "real" (avoid placeholder symbols that will never resolve)
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, symbol, name, asset_type, exchange, country, sector')
      .or('instrument_id.not.is.null,market_cap.not.is.null,exchange.not.is.null,and(sector.not.is.null,sector.neq.Unknown)')
      .order('symbol');

    if (assetsError) {
      console.error('[fetch-daily-prices] Error fetching assets:', assetsError);
      throw assetsError;
    }

    if (!assets || assets.length === 0) {
      console.log('[fetch-daily-prices] No assets found');
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: 'No assets to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[fetch-daily-prices] Found ${assets.length} assets to update`);

    const assetsToProcess = maxAssets !== null ? assets.slice(0, maxAssets) : assets;
    if (maxAssets !== null) {
      console.log(`[fetch-daily-prices] Limiting to ${assetsToProcess.length} assets (max_assets=${maxAssets})`);
    }

    // Batch quotes to reduce Yahoo calls and stay within edge runtime limits
    const batchSize = 25;
    let totalUpdated = 0;
    let totalFailed = 0;
    let yahooUpdated = 0;
    let bullawareUpdated = 0;

    const failedAssets: Array<{ symbol: string; candidates: string[]; reason: string }> = [];

    for (let i = 0; i < assetsToProcess.length; i += batchSize) {
      if (debugFailed && dryRun && failedLimit > 0 && failedAssets.length >= failedLimit) {
        break;
      }

      const batch = assetsToProcess.slice(i, i + batchSize) as AssetRow[];

      const assetToCandidates = new Map<string, string[]>();
      const allCandidates: string[] = [];

      for (const asset of batch) {
        const candidates = yahooCandidatesForAsset(asset);
        assetToCandidates.set(asset.id, candidates);
        allCandidates.push(...candidates);
      }

      const symbols = Array.from(new Set(allCandidates));
      
      console.log(`[fetch-daily-prices] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(assetsToProcess.length / batchSize)}: ${symbols.join(', ')}`);
      
      const quotes = await fetchYahooQuotes(symbols);

      // BullAware fallback for symbols Yahoo can't resolve or when Yahoo is blocked.
      const bullawareQuotes = await fetchBullawareQuotes(batch.map((a) => a.symbol));
      
      for (const asset of batch) {
        const candidates = assetToCandidates.get(asset.id) || [];
        const quoteSymbol = candidates.map((c) => c.toUpperCase()).find((c) => quotes.has(c));
        const quote = quoteSymbol ? quotes.get(quoteSymbol) : undefined;
        const bull = bullawareQuotes.get(String(asset.symbol || '').trim().toUpperCase());
        
        if (quote && quote.regularMarketPrice !== undefined) {
          if (dryRun) {
            totalUpdated++;
            yahooUpdated++;
          } else {
            const { error: updateError } = await supabase
              .from('assets')
              .update({
                current_price: quote.regularMarketPrice,
                price_change: quote.regularMarketChange || 0,
                price_change_pct: quote.regularMarketChangePercent || 0,
                updated_at: new Date().toISOString(),
              })
              .eq('id', asset.id);

            if (updateError) {
              console.error(`[fetch-daily-prices] Error updating ${asset.symbol}:`, updateError);
              totalFailed++;
              if (debugFailed && failedAssets.length < failedLimit) {
                failedAssets.push({
                  symbol: String(asset.symbol || '').trim().toUpperCase(),
                  candidates,
                  reason: 'update_error_yahoo',
                });
              }
            } else {
              console.log(`[fetch-daily-prices] Updated ${asset.symbol}: $${quote.regularMarketPrice} (${quote.regularMarketChangePercent?.toFixed(2)}%)`);
              totalUpdated++;
              yahooUpdated++;
            }
          }
        } else if (bull?.price !== undefined) {
          if (dryRun) {
            totalUpdated++;
            bullawareUpdated++;
          } else {
            const { error: updateError } = await supabase
              .from('assets')
              .update({
                current_price: bull.price,
                price_change: bull.change ?? 0,
                price_change_pct: bull.changePct ?? 0,
                updated_at: new Date().toISOString(),
              })
              .eq('id', asset.id);

            if (updateError) {
              console.error(`[fetch-daily-prices] Error updating ${asset.symbol} (BullAware):`, updateError);
              totalFailed++;
              if (debugFailed && failedAssets.length < failedLimit) {
                failedAssets.push({
                  symbol: String(asset.symbol || '').trim().toUpperCase(),
                  candidates,
                  reason: 'update_error_bullaware',
                });
              }
            } else {
              totalUpdated++;
              bullawareUpdated++;
            }
          }
        } else {
          console.log(`[fetch-daily-prices] No quote data for ${asset.symbol} (tried: ${(assetToCandidates.get(asset.id) || []).join(', ')})`);
          totalFailed++;
          if (debugFailed && failedAssets.length < failedLimit) {
            failedAssets.push({
              symbol: String(asset.symbol || '').trim().toUpperCase(),
              candidates,
              reason: 'no_quote',
            });
          }
        }
      }
      
      // Light rate limiting - wait between batches
      if (i + batchSize < assetsToProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(`[fetch-daily-prices] Completed: ${totalUpdated} updated, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: totalUpdated,
        failed: totalFailed,
        total: assetsToProcess.length,
        yahoo_updated: yahooUpdated,
        bullaware_updated: bullawareUpdated,
        ...(debugFailed ? { failed_assets: failedAssets } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fetch-daily-prices] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
