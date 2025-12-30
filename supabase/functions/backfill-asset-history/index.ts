import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { yahooSymbolCandidates } from "../_shared/yahooSymbol.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AssetRow = {
  id: string;
  symbol: string;
  exchange?: string | null;
  country?: string | null;
  currency?: string | null;
  asset_type?: string | null;
  sector?: string | null;
  price_history_synced_at?: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toIsoDate(tsSeconds: number) {
  return new Date(tsSeconds * 1000).toISOString().split("T")[0];
}

function safeNumber(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const invocationId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body?.limit ?? 25), 200));
    const staleDays = Math.max(1, Math.min(Number(body?.stale_days ?? 7), 365));
    const range = typeof body?.range === "string" && body.range ? body.range : "5y";
    const interval = typeof body?.interval === "string" && body.interval ? body.interval : "1d";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cutoffIso = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

    let assets: AssetRow[] = [];

    // Prefer selecting by price_history_synced_at if column exists.
    const candidateQuery = supabase
      .from("assets")
      .select("id, symbol, exchange, country, currency, asset_type, sector, price_history_synced_at")
      .or(`price_history_synced_at.is.null,price_history_synced_at.lt.${cutoffIso}`)
      .order("price_history_synced_at", { ascending: true, nullsFirst: true })
      .limit(limit);

    const { data: candidateData, error: candidateErr } = await candidateQuery;

    if (candidateErr) {
      // Fallback for older DBs where the column isn't present yet.
      console.warn(`[${invocationId}] candidate query failed; falling back to selecting assets without filter:`, candidateErr);
      const { data: fallback, error: fallbackErr } = await supabase
        .from("assets")
        .select("id, symbol, exchange, country, currency, asset_type, sector")
        .order("updated_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (fallbackErr) throw fallbackErr;
      assets = (fallback || []) as any;
    } else {
      assets = (candidateData || []) as any;
    }

    if (assets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No assets need backfill", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;
    let updatedAssets = 0;
    let insertedPoints = 0;
    const errors: Array<{ symbol: string; error: string }> = [];

    for (const asset of assets) {
      processed++;
      const symbol = asset.symbol;

      try {
        const candidates = yahooSymbolCandidates({
          symbol: asset.symbol,
          exchange: asset.exchange ?? null,
          country: asset.country ?? null,
          currency: asset.currency ?? null,
          asset_type: asset.asset_type ?? null,
          sector: asset.sector ?? null,
        });

        let result: any = null;
        let timestamps: number[] = [];
        let quote: any = null;
        let lastErr: string | null = null;

        for (const candidate of candidates) {
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;

          const resp = await fetch(chartUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "application/json,text/plain,*/*",
              "Accept-Language": "en-US,en;q=0.9",
              "Referer": "https://finance.yahoo.com/",
            },
          });

          if (!resp.ok) {
            lastErr = `HTTP ${resp.status}`;
            continue;
          }

          const data = await resp.json();
          result = data?.chart?.result?.[0] ?? null;
          timestamps = result?.timestamp || [];
          quote = result?.indicators?.quote?.[0];

          if (!result || !quote || timestamps.length === 0) {
            lastErr = "No chart data returned";
            result = null;
            continue;
          }

          lastErr = null;
          break;
        }

        if (!result || !quote || timestamps.length === 0) {
          throw new Error(`No chart data returned (tried: ${candidates.join(", ")})${lastErr ? `: ${lastErr}` : ""}`);
        }

        const rows = timestamps
          .map((ts: number, i: number) => ({
            asset_id: asset.id,
            date: toIsoDate(ts),
            open_price: safeNumber(quote.open?.[i]),
            high_price: safeNumber(quote.high?.[i]),
            low_price: safeNumber(quote.low?.[i]),
            close_price: safeNumber(quote.close?.[i]),
            volume: safeNumber(quote.volume?.[i]),
          }))
          .filter((r: any) => r.close_price !== null);

        // Upsert in chunks to avoid request limits.
        for (const batch of chunk(rows, 500)) {
          const { error: upsertErr } = await supabase
            .from("price_history")
            .upsert(batch, { onConflict: "asset_id,date" });
          if (upsertErr) throw upsertErr;
          insertedPoints += batch.length;
        }

        const nowIso = new Date().toISOString();
        const { error: assetUpdateErr } = await supabase
          .from("assets")
          .update({ price_history_synced_at: nowIso, updated_at: nowIso })
          .eq("id", asset.id);

        if (assetUpdateErr) {
          const msg = (assetUpdateErr as any)?.message || JSON.stringify(assetUpdateErr);
          // Backwards-compatible fallback if migration hasn't been applied yet.
          if (typeof msg === "string" && msg.includes("price_history_synced_at")) {
            const { error: fallbackUpdateErr } = await supabase
              .from("assets")
              .update({ updated_at: nowIso })
              .eq("id", asset.id);
            if (fallbackUpdateErr) throw fallbackUpdateErr;
          } else {
            throw assetUpdateErr;
          }
        }

        updatedAssets++;
      } catch (e: any) {
        errors.push({ symbol, error: e?.message || String(e) });
      }

      // Friendly rate limiting.
      await sleep(250);
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        message: "Backfill completed",
        processed,
        updated_assets: updatedAssets,
        price_points_upserted: insertedPoints,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
