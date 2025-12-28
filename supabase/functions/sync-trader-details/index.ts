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
    const BULLAWARE_API_KEY = Deno.env.get('BULLAWARE_API_KEY');
    // Prefer injected env; fall back to request origin to avoid "supabaseUrl is required".
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? new URL(req.url).origin;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const BULLAWARE_BASE = 'https://api.bullaware.com/v1';

    let username: string | null = null;
    let jobType: string | null = null;
    try {
      const body = await req.json();
      username = body.username || null;
      jobType = body.job_type || null;
    } catch { }

    if (!BULLAWARE_API_KEY) {
      return new Response(JSON.stringify({
        success: false,
        error: 'BULLAWARE_API_KEY not configured',
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let tradersToSync: any[] = [];
    if (username) {
      // Fetch specific trader by username
      const { data: trader } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .eq('etoro_username', username)
        .maybeSingle();
      if (trader) tradersToSync = [trader];
    } else {
      // Fetch stale trader details (separate from basic profile updated_at)
      const staleThreshold = new Date(Date.now() - 6 * 3600000).toISOString();
      const { data: staleTraders } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .or(`details_synced_at.lt.${staleThreshold},details_synced_at.is.null`)
        .limit(10);
      if (staleTraders) tradersToSync = staleTraders;
    }


    if (tradersToSync.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No traders to sync",
        synced: 0 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const endpointForJobType = (jt: string) => {
      switch (jt) {
        case 'investor_details':
          return `${BULLAWARE_BASE}/investors/${username}`;
        case 'risk_score':
          return `${BULLAWARE_BASE}/investors/${username}/risk-score/monthly`;
        case 'metrics':
          return `${BULLAWARE_BASE}/investors/${username}/metrics`;
        case 'portfolio':
        default:
          return `${BULLAWARE_BASE}/investors/${username}/portfolio`;
      }
    };

    let syncedCount = 0;
    for (let i = 0; i < tradersToSync.length; i++) {
        const trader = tradersToSync[i];
        const effectiveJobType = jobType || 'portfolio';

        const url = endpointForJobType(effectiveJobType);
        let apiData: any = null;

        try {
          const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${BULLAWARE_API_KEY}` },
            signal: AbortSignal.timeout(15000),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => '');
            const msg = `Bullaware HTTP ${res.status} for ${trader.etoro_username} (${effectiveJobType}): ${text.substring(0, 300)}`;
            await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
            console.error(msg);
            continue;
          }
          apiData = await res.json();
        } catch (e: any) {
          const msg = `Bullaware request failed for ${trader.etoro_username} (${effectiveJobType}): ${e?.message || String(e)}`;
          await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
          console.error(msg);
          continue;
        }

        const nowIso = new Date().toISOString();

        if (effectiveJobType === 'investor_details') {
          const investor = apiData?.investor || apiData?.data || apiData;
          await supabase.from('traders').update({
            profitable_weeks_pct: investor?.profitableWeeksPct ?? investor?.profitable_weeks_pct ?? null,
            profitable_months_pct: investor?.profitableMonthsPct ?? investor?.profitable_months_pct ?? null,
            daily_drawdown: investor?.dailyDD ?? investor?.daily_drawdown ?? null,
            weekly_drawdown: investor?.weeklyDD ?? investor?.weekly_drawdown ?? null,
            details_synced_at: nowIso,
            last_sync_error: null,
          }).eq('id', trader.id);
          syncedCount++;
          continue;
        }

        if (effectiveJobType === 'risk_score') {
          const score = typeof apiData === 'number'
            ? apiData
            : (apiData?.riskScore ?? apiData?.points?.[apiData?.points?.length - 1]?.riskScore);
          await supabase.from('traders').update({
            risk_score: score ?? null,
            details_synced_at: nowIso,
            last_sync_error: null,
          }).eq('id', trader.id);
          syncedCount++;
          continue;
        }

        if (effectiveJobType === 'metrics') {
          const m = apiData?.data || apiData;
          await supabase.from('traders').update({
            sharpe_ratio: m?.sharpeRatio ?? m?.sharpe_ratio ?? null,
            sortino_ratio: m?.sortinoRatio ?? m?.sortino_ratio ?? null,
            alpha: m?.alpha ?? null,
            beta: m?.beta ?? null,
            details_synced_at: nowIso,
            last_sync_error: null,
          }).eq('id', trader.id);
          syncedCount++;
          continue;
        }

        // portfolio (default)
        // BullAware payloads vary; commonly holdings/positions live under `data`.
        const portfolioRoot = apiData?.data ?? apiData;
        const holdings =
          portfolioRoot?.holdings ||
          portfolioRoot?.positions ||
          portfolioRoot?.items ||
          portfolioRoot?.portfolio ||
          (Array.isArray(portfolioRoot) ? portfolioRoot : []);
        if (!Array.isArray(holdings)) {
          const msg = `Unexpected portfolio payload for ${trader.etoro_username}`;
          await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
          console.error(msg);
          continue;
        }

        const normalizeSymbol = (raw: any): string[] => {
          const base = (raw ?? '').toString().trim().toUpperCase();
          if (!base) return [];
          const noPrefix = base.includes(':') ? base.split(':').pop()!.trim() : base;
          const noSuffix = noPrefix.includes('.') ? noPrefix.split('.')[0].trim() : noPrefix;
          const cleaned = noSuffix.replace(/[^A-Z0-9\-]/g, '');

          // Return a small set of candidates ordered by likelihood.
          return Array.from(new Set([base, noPrefix, noSuffix, cleaned].filter(Boolean)));
        };

        const symbols = Array.from(
          new Set(
            holdings
              .flatMap((h: any) => normalizeSymbol(h?.symbol || h?.ticker || h?.asset || h?.assetSymbol || h?.instrument))
              .filter(Boolean)
          )
        );

        const symbolToAssetId = new Map<string, string>();
        if (symbols.length > 0) {
          const { data: assets, error: assetsErr } = await supabase
            .from('assets')
            .select('id, symbol')
            .in('symbol', symbols);
          if (assetsErr) {
            console.error('Error looking up assets for holdings:', assetsErr);
          } else {
            (assets || []).forEach((a: any) => symbolToAssetId.set(String(a.symbol).toUpperCase(), a.id));
          }
        }

        const rows = holdings
          .map((h: any) => {
            const candidates = normalizeSymbol(h?.symbol || h?.ticker || h?.asset || h?.assetSymbol || h?.instrument);
            const assetId = candidates.map((c) => symbolToAssetId.get(c)).find(Boolean) || null;
            if (!assetId) return null;
            return {
              trader_id: trader.id,
              asset_id: assetId,
              allocation_pct: h?.allocation ?? h?.weight ?? h?.allocation_pct ?? null,
              profit_loss_pct: h?.profitLoss ?? h?.pnl ?? h?.profit_loss_pct ?? null,
              updated_at: nowIso,
            };
          })
          .filter(Boolean);

        // Replace holdings snapshot only if we could map at least one holding.
        // This prevents wiping existing holdings when symbol formats don't match assets.
        if (rows.length === 0 && holdings.length > 0) {
          const msg = `No holdings matched assets for ${trader.etoro_username} (symbols may need normalization)`;
          await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
          console.warn(msg);
          continue;
        }

        if (rows.length > 0) {
          await supabase.from('trader_holdings').delete().eq('trader_id', trader.id);
          const { error: insertError } = await supabase.from('trader_holdings').insert(rows as any);
          if (insertError) {
            const msg = `Error inserting holdings for ${trader.etoro_username}: ${insertError.message}`;
            await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
            console.error(msg);
            continue;
          }
        }

        await supabase.from('traders').update({ details_synced_at: nowIso, last_sync_error: null }).eq('id', trader.id);
        syncedCount++;
    }
    
    return new Response(JSON.stringify({ 
        success: true, 
      message: `Synced ${syncedCount} trader detail jobs from Bullaware API`,
        synced: syncedCount,
        api_used: !!BULLAWARE_API_KEY
    }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
      console.error("Error in sync-trader-details:", error);
      return new Response(JSON.stringify({ 
          success: false,
          error: error.message 
      }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
  }
});
