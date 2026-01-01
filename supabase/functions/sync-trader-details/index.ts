import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const coerceNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    const cleaned = t
      .replace(/[%,$\s]/g, '')
      .replace(/(\d),(\d{3})(\b)/g, '$1$2');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
    let debug: boolean = false;
    let debugLite: boolean = false;
    let rawBody: any = {};
    try {
      rawBody = await req.json();
      username = rawBody.username || null;
      jobType = rawBody.job_type || null;
      debug = rawBody.debug === true || rawBody.debug === 1 || rawBody.debug === '1';
      debugLite = rawBody.debug === 'lite' || rawBody.debug_lite === true || rawBody.debug_lite === 1 || rawBody.debug_lite === '1';
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
        case 'trades':
          return `${BULLAWARE_BASE}/investors/${username}/trades`;
        case 'portfolio':
        default:
          return `${BULLAWARE_BASE}/investors/${username}/portfolio`;
      }
    };

    const fnv1a64 = (input: string): bigint => {
      let hash = 0xcbf29ce484222325n;
      const prime = 0x100000001b3n;
      for (let i = 0; i < input.length; i++) {
        hash ^= BigInt(input.charCodeAt(i));
        hash = BigInt.asUintN(64, hash * prime);
      }
      return hash;
    };

    const stablePositionId = (raw: any): string | null => {
      if (raw === null || raw === undefined) return null;

      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return String(Math.trunc(raw));
      }

      const s = String(raw).trim();
      if (!s) return null;

      const asNum = Number(s);
      if (Number.isFinite(asNum)) return String(Math.trunc(asNum));

      const h = fnv1a64(s);
      const positive = BigInt.asUintN(63, h);
      return positive === 0n ? '1' : positive.toString();
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

          if (debug || debugLite) {
            const inv = investor && typeof investor === 'object' ? investor : {};
            const keys = Object.keys(inv);
            const interesting = keys
              .filter((k) => /return|gain|ytd|year|month|five/i.test(k))
              .sort();
            const sample: Record<string, any> = {};
            for (const k of interesting.slice(0, debugLite ? 15 : 50)) sample[k] = (inv as any)[k];
            return new Response(JSON.stringify({
              success: true,
              debug: true,
              debug_lite: debugLite,
              job_type: effectiveJobType,
              username: trader.etoro_username,
              top_level_keys: debugLite ? undefined : keys.slice(0, 200),
              interesting_keys: interesting,
              sample,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const update: Record<string, any> = {
            profitable_weeks_pct: investor?.profitableWeeksPct ?? investor?.profitable_weeks_pct ?? null,
            profitable_months_pct: investor?.profitableMonthsPct ?? investor?.profitable_months_pct ?? null,
            daily_drawdown: investor?.dailyDD ?? investor?.daily_drawdown ?? null,
            weekly_drawdown: investor?.weeklyDD ?? investor?.weekly_drawdown ?? null,
            details_synced_at: nowIso,
            last_sync_error: null,
          };

          const coerceScalarNumber = (v: any): number | null => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string') {
              const t = v.trim();
              if (!t) return null;
              // Strip common formatting like "$2M-$5M" or "3,056,357.59".
              const cleaned = t.replace(/[^0-9+\-\.]/g, '');
              const n = Number(cleaned);
              return Number.isFinite(n) ? n : null;
            }
            return null;
          };

          const firstCoercedNumber = (...candidates: any[]): number | null => {
            for (const c of candidates) {
              const n = coerceScalarNumber(c);
              if (n !== null) return n;
            }
            return null;
          };

          // Common profile fields that are often missing in DB when only eToro rankings are used.
          // Only set if BullAware provides a value.
          const aum = firstCoercedNumber(
            investor?.aumValue,
            investor?.AUMValue,
            investor?.assetsUnderManagement,
            investor?.assets_under_management,
            investor?.aum,
            investor?.AUM,
          );
          if (aum !== null) update.aum = aum;

          const copiers = coerceScalarNumber(investor?.copiers ?? investor?.Copiers ?? investor?.followers ?? investor?.Followers);
          if (copiers !== null) update.copiers = Math.trunc(copiers);

          const gain12m = coerceScalarNumber(investor?.gain12m ?? investor?.gain_12m ?? investor?.return12m ?? investor?.return_12m ?? investor?.return1Year);
          if (gain12m !== null) update.gain_12m = gain12m;

          const gain24m = coerceScalarNumber(investor?.gain24m ?? investor?.gain_24m ?? investor?.return24m ?? investor?.return_24m ?? investor?.return2Years);
          if (gain24m !== null) update.gain_24m = gain24m;

          // Trader metrics (added columns): attempt to map from BullAware scalars if present.
          // These keys vary across payloads; keep it tolerant.
          // NOTE: We intentionally avoid deriving 1M return from monthlyReturns maps here.
          // The UI's 1M Return is populated reliably from eToro OneMonthAgo Gain via sync-trader-etoro.
          const ret1m = coerceScalarNumber(
            investor?.return_1m ?? investor?.return1m ?? investor?.gain1m ?? investor?.gain_1m ??
            investor?.oneMonthReturn ?? investor?.returnOneMonth
          );
          if (ret1m !== null) update.return_1m = ret1m;

          const retYtd = coerceScalarNumber(
            investor?.return_ytd ?? investor?.returnYtd ?? investor?.ytdReturn ?? investor?.ytd_return ??
            investor?.gainYtd ?? investor?.gain_ytd ?? investor?.ytd_gain ??
            investor?.returnYearToDate ?? investor?.return_year_to_date ?? investor?.returnYTD
          );
          if (retYtd !== null) update.return_ytd = retYtd;

          const ret5y = coerceScalarNumber(
            investor?.return_5y ?? investor?.return5y ?? investor?.gain5y ?? investor?.gain_5y ??
            investor?.fiveYearReturn ?? investor?.returnFiveYears ?? investor?.return_60m ?? investor?.return60m ??
            investor?.return5Years ?? investor?.return_5_years
          );
          if (ret5y !== null) update.return_5y = ret5y;

          const maxDd = investor?.maxDrawdown ?? investor?.max_drawdown;
          if (maxDd !== undefined) update.max_drawdown = maxDd;

          const activeSince = investor?.activeSince ?? investor?.active_since ?? investor?.memberSince ?? investor?.member_since;
          if (activeSince !== undefined) update.active_since = activeSince;

          const avgTradesPerWeek = investor?.avg_trades_per_week ?? investor?.avgTradesPerWeek ?? investor?.tradesPerWeek ?? investor?.avgWeeklyTrades;
          if (avgTradesPerWeek !== undefined) update.avg_trades_per_week = avgTradesPerWeek;

          const avgHoldingDays = investor?.avg_holding_time_days ?? investor?.avgHoldingTimeDays ?? investor?.avgHoldingDays ?? investor?.avgHoldingTime;
          if (avgHoldingDays !== undefined) update.avg_holding_time_days = avgHoldingDays;

          const toDateOnly = (v: any): string | null => {
            if (!v) return null;
            try {
              if (typeof v === 'string') {
                const s = v.trim();
                if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
              }
              const d = new Date(v);
              if (!Number.isFinite(d.getTime())) return null;
              const yyyy = d.getUTCFullYear();
              const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
              const dd = String(d.getUTCDate()).padStart(2, '0');
              return `${yyyy}-${mm}-${dd}`;
            } catch {
              return null;
            }
          };

          const traderId = trader.id;

          // 1) Monthly performance (trader_performance)
          const monthlyCandidates =
            investor?.monthly_returns ||
            investor?.monthlyReturns ||
            investor?.monthlyPerformance ||
            investor?.performance?.monthly ||
            investor?.performance?.monthlyReturns ||
            investor?.performanceMonthly ||
            null;

          // BullAware sometimes returns monthly returns as an array, sometimes as a map:
          //   { "2025-12": 1.53, "2025-11": 1.64, ... }
          let monthlyArr: any[] = [];
          if (Array.isArray(monthlyCandidates)) {
            monthlyArr = monthlyCandidates;
          } else if (monthlyCandidates && typeof monthlyCandidates === 'object') {
            monthlyArr = Object.entries(monthlyCandidates as Record<string, unknown>).map(([key, value]) => ({
              key,
              date: key,
              return_pct: value,
            }));
          }

          if (monthlyArr.length > 0) {
            const rows = monthlyArr
              .map((p: any) => {
                const year = Number(p?.year ?? p?.Year ?? p?.y ?? null);
                const month = Number(p?.month ?? p?.Month ?? p?.m ?? null);
                const ymKey = String(p?.key ?? p?.date ?? p?.Date ?? '').trim();
                const ymMatch = ymKey.match(/^(\d{4})-(\d{1,2})/);
                const date = toDateOnly(p?.date ?? p?.Date ?? p?.monthDate ?? p?.timestamp);
                const d = date ? new Date(`${date}T00:00:00Z`) : null;
                const yr = Number.isFinite(year)
                  ? year
                  : (ymMatch ? Number(ymMatch[1]) : (d ? d.getUTCFullYear() : NaN));
                const mo = Number.isFinite(month)
                  ? month
                  : (ymMatch ? Number(ymMatch[2]) : (d ? d.getUTCMonth() + 1 : NaN));
                const ret = coerceNumber(p?.return_pct ?? p?.returnPct ?? p?.return ?? p?.value ?? p?.pct ?? p?.percent);
                if (!Number.isFinite(yr) || !Number.isFinite(mo)) return null;
                return { trader_id: traderId, year: yr, month: mo, return_pct: ret };
              })
              .filter(Boolean);

            if (rows.length > 0) {
              const { error: upsertPerfErr } = await supabase
                .from('trader_performance')
                .upsert(rows as any, { onConflict: 'trader_id,year,month' });
              if (upsertPerfErr) {
                console.error('Error upserting trader_performance:', upsertPerfErr);
              }

              // Do not auto-set return_1m from monthly performance here.
            }
          }

          // 2) Equity history vs benchmark (trader_equity_history)
          const equityCandidates =
            investor?.equity_history ||
            investor?.equityHistory ||
            investor?.performanceVsBenchmark ||
            investor?.equity_vs_benchmark ||
            investor?.equityVsBenchmark ||
            investor?.history?.equity ||
            null;

          const equityArr = Array.isArray(equityCandidates) ? equityCandidates : [];
          if (equityArr.length > 0) {
            const rows = equityArr
              .map((p: any) => {
                const date = toDateOnly(p?.date ?? p?.Date ?? p?.d ?? p?.timestamp);
                if (!date) return null;
                const equity = coerceNumber(p?.equity_value ?? p?.equityValue ?? p?.equity ?? p?.value ?? p?.portfolioValue);
                if (equity === null) return null;
                const benchmark = coerceNumber(p?.benchmark_value ?? p?.benchmarkValue ?? p?.benchmark ?? p?.sp500 ?? p?.indexValue);
                return { trader_id: traderId, date, equity_value: equity, benchmark_value: benchmark };
              })
              .filter(Boolean);

            if (rows.length > 0) {
              const { error: upsertEquityErr } = await supabase
                .from('trader_equity_history')
                .upsert(rows as any, { onConflict: 'trader_id,date' });
              if (upsertEquityErr) {
                console.error('Error upserting trader_equity_history:', upsertEquityErr);
              }
            }
          }

          // 3) Portfolio composition over time (trader_portfolio_history)
          const portfolioHistoryCandidates =
            investor?.portfolio_history ||
            investor?.portfolioHistory ||
            investor?.holdings_history ||
            investor?.holdingsHistory ||
            investor?.history?.portfolio ||
            null;

          const portfolioHistoryArr = Array.isArray(portfolioHistoryCandidates) ? portfolioHistoryCandidates : [];
          if (portfolioHistoryArr.length > 0) {
            const rows = portfolioHistoryArr
              .map((snap: any) => {
                const date = toDateOnly(snap?.date ?? snap?.Date ?? snap?.d ?? snap?.timestamp);
                if (!date) return null;

                let holdings = snap?.holdings ?? snap?.positions ?? snap?.items ?? snap?.portfolio ?? snap?.data ?? [];
                // Some APIs return a map { AAPL: 12.3, TSLA: 4.5 }
                if (holdings && !Array.isArray(holdings) && typeof holdings === 'object') {
                  holdings = Object.entries(holdings).map(([symbol, value]) => ({ symbol, value }));
                }

                const arr = Array.isArray(holdings) ? holdings : [];
                const normalized = arr
                  .map((h: any) => {
                    const symbol = String(h?.symbol ?? h?.ticker ?? h?.asset ?? h?.instrument ?? '').trim();
                    const value = coerceNumber(h?.value ?? h?.weight ?? h?.allocation ?? h?.allocation_pct ?? h?.pct);
                    if (!symbol || value === null) return null;
                    const name = h?.name ? String(h.name) : undefined;
                    return name ? { symbol, value, name } : { symbol, value };
                  })
                  .filter(Boolean);

                return { trader_id: traderId, date, holdings: normalized };
              })
              .filter(Boolean);

            if (rows.length > 0) {
              const { error: upsertPHistErr } = await supabase
                .from('trader_portfolio_history')
                .upsert(rows as any, { onConflict: 'trader_id,date' });
              if (upsertPHistErr) {
                console.error('Error upserting trader_portfolio_history:', upsertPHistErr);
              }
            }
          }

          // 4) Derived return metrics from monthly performance.
          // BullAware often provides monthly returns; from that we can derive:
          // - return_1m: latest month return
          // - return_ytd: compounded return for current calendar year
          // - return_5y: compounded return across last 60 months (only if we have full 60)
          try {
            const { data: perfRows, error: perfErr } = await supabase
              .from('trader_performance')
              .select('year,month,return_pct')
              .eq('trader_id', traderId)
              .order('year', { ascending: false })
              .order('month', { ascending: false })
              .limit(60);

            if (!perfErr && Array.isArray(perfRows) && perfRows.length > 0) {
              const returns = perfRows
                .map((r: any) => ({
                  year: Number(r?.year),
                  month: Number(r?.month),
                  return_pct: coerceNumber(r?.return_pct),
                }))
                .filter((r: any) => Number.isFinite(r.year) && Number.isFinite(r.month));

              const compoundedPct = (parts: number[]): number | null => {
                if (!Array.isArray(parts) || parts.length === 0) return null;
                let factor = 1;
                for (const p of parts) {
                  if (!Number.isFinite(p)) continue;
                  factor *= (1 + p / 100);
                }
                const out = (factor - 1) * 100;
                return Number.isFinite(out) ? out : null;
              };

              // YTD (current year)
              const currentYear = new Date().getUTCFullYear();
              const ytdParts = returns
                .filter((r: any) => r.year === currentYear && r.return_pct !== null)
                .map((r: any) => r.return_pct as number);
              const ytd = compoundedPct(ytdParts);
              if (ytd !== null) update.return_ytd = ytd;

              // 5Y (require full 60 months of non-null returns)
              const parts5y = returns
                .filter((r: any) => r.return_pct !== null)
                .map((r: any) => r.return_pct as number);
              if (parts5y.length >= 60) {
                const fiveYear = compoundedPct(parts5y.slice(0, 60));
                if (fiveYear !== null) update.return_5y = fiveYear;
              }
            }
          } catch (_e) {
            // Best-effort only
          }

          {
            const { error: traderUpdateErr } = await supabase
              .from('traders')
              .update(update)
              .eq('id', trader.id);
            if (traderUpdateErr) {
              const msg = `Failed to update traders for ${trader.etoro_username}: ${traderUpdateErr.message}`;
              console.error(msg);
              // Best-effort record the error; avoid crashing the whole batch.
              await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
              continue;
            }
          }
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

          if (debug) {
            const obj = m && typeof m === 'object' ? m : {};
            const keys = Object.keys(obj);
            const interesting = keys
              .filter((k) => /return|gain|ytd|year|month|five/i.test(k))
              .sort();
            const sample: Record<string, any> = {};
            for (const k of interesting.slice(0, 50)) sample[k] = (obj as any)[k];
            return new Response(JSON.stringify({
              success: true,
              debug: true,
              job_type: effectiveJobType,
              username: trader.etoro_username,
              top_level_keys: keys.slice(0, 200),
              interesting_keys: interesting,
              sample,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const update: Record<string, any> = {
            sharpe_ratio: m?.sharpeRatio ?? m?.sharpe_ratio ?? null,
            sortino_ratio: m?.sortinoRatio ?? m?.sortino_ratio ?? null,
            alpha: m?.alpha ?? null,
            beta: m?.beta ?? null,
            volatility: m?.volatility ?? m?.volatility_pct ?? m?.volatilityPct ?? null,
            omega_ratio: m?.omegaRatio ?? m?.omega_ratio ?? null,
            treynor_ratio: m?.treynorRatio ?? m?.treynor_ratio ?? null,
            calmar_ratio: m?.calmarRatio ?? m?.calmar_ratio ?? null,
            information_ratio: m?.informationRatio ?? m?.information_ratio ?? null,
            details_synced_at: nowIso,
            last_sync_error: null,
          };

          const ret1m = coerceNumber(m?.return_1m ?? m?.return1m ?? m?.gain1m ?? m?.gain_1m ?? m?.oneMonthReturn);
          if (ret1m !== null) update.return_1m = ret1m;
          const retYtd = coerceNumber(m?.return_ytd ?? m?.returnYtd ?? m?.ytdReturn ?? m?.gain_ytd ?? m?.gainYtd);
          if (retYtd !== null) update.return_ytd = retYtd;
          const ret5y = coerceNumber(m?.return_5y ?? m?.return5y ?? m?.gain5y ?? m?.gain_5y ?? m?.fiveYearReturn ?? m?.return_60m);
          if (ret5y !== null) update.return_5y = ret5y;

          await supabase.from('traders').update(update).eq('id', trader.id);
          syncedCount++;
          continue;
        }

        if (effectiveJobType === 'trades') {
          const root = apiData?.data ?? apiData;
          const trades = Array.isArray(root) ? root : (Array.isArray(root?.trades) ? root.trades : []);

          if (!Array.isArray(trades)) {
            const msg = `Unexpected trades payload for ${trader.etoro_username}`;
            await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
            console.error(msg);
            continue;
          }

          const normalizeSymbol = (raw: any): string[] => {
            const base = (raw ?? '').toString().trim().toUpperCase();
            if (!base) return [];
            const noPrefix = base.includes(':') ? base.split(':').pop()!.trim() : base;
            const noSuffix = noPrefix.includes('.') ? noPrefix.split('.')[0].trim() : noPrefix;
            const cleaned = noSuffix.replace(/[^A-Z0-9-]/g, '');
            return Array.from(new Set([base, noPrefix, noSuffix, cleaned].filter(Boolean)));
          };

          const symbols = Array.from(
            new Set(
              trades
                .flatMap((t: any) => normalizeSymbol(t?.symbol || t?.ticker || t?.asset || t?.assetSymbol || t?.instrument))
                .filter(Boolean),
            ),
          );

          const symbolToAssetId = new Map<string, string>();
          if (symbols.length > 0) {
            const { data: assets, error: assetsErr } = await supabase
              .from('assets')
              .select('id, symbol')
              .in('symbol', symbols);
            if (assetsErr) {
              console.error('Error looking up assets for trades:', assetsErr);
            } else {
              (assets || []).forEach((a: any) => symbolToAssetId.set(String(a.symbol).toUpperCase(), a.id));
            }
          }

          const canonicalSymbols = Array.from(
            new Set(
              trades
                .map((t: any) => {
                  const candidates = normalizeSymbol(t?.symbol || t?.ticker || t?.asset || t?.assetSymbol || t?.instrument);
                  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
                })
                .filter(Boolean),
            ),
          ) as string[];

          const missingCanonical = canonicalSymbols.filter((s) => !symbolToAssetId.has(String(s).toUpperCase()));
          if (missingCanonical.length > 0) {
            const { error: upsertErr } = await supabase
              .from('assets')
              .upsert(
                missingCanonical.map((s) => ({ symbol: String(s).toUpperCase(), name: String(s).toUpperCase() })),
                { onConflict: 'symbol', ignoreDuplicates: true },
              );
            if (upsertErr) {
              console.error('Error upserting placeholder assets for trades:', upsertErr);
            } else {
              const { data: createdAssets, error: createdAssetsErr } = await supabase
                .from('assets')
                .select('id, symbol')
                .in('symbol', missingCanonical.map((s) => String(s).toUpperCase()));
              if (createdAssetsErr) {
                console.error('Error re-fetching placeholder assets for trades:', createdAssetsErr);
              } else {
                (createdAssets || []).forEach((a: any) => symbolToAssetId.set(String(a.symbol).toUpperCase(), a.id));
              }
            }
          }

          const toIso = (v: any): string | null => {
            if (!v) return null;
            try {
              const d = new Date(v);
              return Number.isFinite(d.getTime()) ? d.toISOString() : null;
            } catch {
              return null;
            }
          };

          const debugStats = {
            raw_trades: Array.isArray(trades) ? trades.length : 0,
            mapped_rows: 0,
            skipped_missing_asset: 0,
            skipped_invalid_action: 0,
            skipped_missing_position_id: 0,
            sample_raw: [] as any[],
            sample_mapped: [] as any[],
            missing_asset_symbols: [] as string[],
          };

          if (debug || debugLite) {
            debugStats.sample_raw = (Array.isArray(trades) ? trades.slice(0, 3) : []);
          }

          const rows = trades
            .map((t: any) => {
              const candidates = normalizeSymbol(t?.symbol || t?.ticker || t?.asset || t?.assetSymbol || t?.instrument);
              const assetId = candidates.map((c) => symbolToAssetId.get(c)).find(Boolean) || null;
              if (!assetId) {
                debugStats.skipped_missing_asset++;
                if ((debug || debugLite) && debugStats.missing_asset_symbols.length < 10) {
                  const first = candidates?.[0] ? String(candidates[0]) : '';
                  if (first) debugStats.missing_asset_symbols.push(first);
                }
                return null;
              }

              const rawAction = (t?.action ?? t?.side ?? t?.type ?? '').toString().toLowerCase();
              const action = rawAction.includes('sell') ? 'sell' : (rawAction.includes('buy') ? 'buy' : null);
              if (!action) {
                debugStats.skipped_invalid_action++;
                return null;
              }

              const executedAt =
                toIso(t?.executed_at) ||
                toIso(t?.executedAt) ||
                toIso(t?.close_date) ||
                toIso(t?.closeDate) ||
                toIso(t?.date) ||
                nowIso;

              const openDate = toIso(t?.open_date) || toIso(t?.openDate) || null;

              const positionId = t?.position_id ?? t?.positionId ?? t?.id ?? null;
              const positionIdStable = stablePositionId(positionId);
              if (!positionIdStable) {
                debugStats.skipped_missing_position_id++;
                return null;
              }

              return {
                trader_id: trader.id,
                asset_id: assetId,
                action,
                amount: t?.amount ?? t?.units ?? t?.investment ?? null,
                price: t?.price ?? t?.entryPrice ?? null,
                percentage_of_portfolio: t?.percentage_of_portfolio ?? t?.percentageOfPortfolio ?? t?.weight ?? null,
                executed_at: executedAt,
                open_price: t?.open_price ?? t?.openPrice ?? null,
                close_price: t?.close_price ?? t?.closePrice ?? null,
                profit_loss_pct: t?.profit_loss_pct ?? t?.profitLossPct ?? t?.pnl_pct ?? t?.pnlPct ?? null,
                open_date: openDate,
                position_id: positionIdStable,
              };
            })
            .filter(Boolean);

          debugStats.mapped_rows = rows.length;
          if ((debug || debugLite) && rows.length > 0) {
            debugStats.sample_mapped = (rows as any[]).slice(0, 3);
          }

          if (rows.length > 0) {
            const upsertWith = async (onConflict: string) =>
              await supabase.from('trades').upsert(rows as any, { onConflict });

            // Prefer composite key to avoid cross-trader overwrites, but fall back gracefully
            // if the remote DB hasn't had the migration applied yet.
            let { error: upsertTradesErr } = await upsertWith('trader_id,position_id');
            if (
              upsertTradesErr &&
              /no unique|no exclusion|matching the ON CONFLICT/i.test(upsertTradesErr.message)
            ) {
              ({ error: upsertTradesErr } = await upsertWith('position_id'));
            }
            if (upsertTradesErr) {
              const msg = `Error upserting trades for ${trader.etoro_username}: ${upsertTradesErr.message}`;
              await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
              console.error(msg);
              continue;
            }
          }

          await supabase.from('traders').update({ details_synced_at: nowIso, last_sync_error: null }).eq('id', trader.id);
          syncedCount++;

          if ((debug || debugLite) && username) {
            return new Response(JSON.stringify({
              success: true,
              message: `Trades sync debug for ${trader.etoro_username}`,
              trader_id: trader.id,
              debug: debugStats,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          continue;
        }

        // portfolio (default)
        // BullAware payloads vary; commonly holdings/positions live under `data`.
        const portfolioRoot = apiData?.data ?? apiData;
        let holdings: any =
          portfolioRoot?.holdings ||
          portfolioRoot?.positions ||
          portfolioRoot?.items ||
          portfolioRoot?.portfolio ||
          (Array.isArray(portfolioRoot) ? portfolioRoot : []);

        // Some APIs return a map like { AAPL: 12.3, TSLA: 4.5 }
        if (holdings && !Array.isArray(holdings) && typeof holdings === 'object') {
          holdings = Object.entries(holdings).map(([symbol, value]) => ({ symbol, value, allocation: value }));
        }

        if (!Array.isArray(holdings)) {
          const msg = `Unexpected portfolio payload for ${trader.etoro_username}`;
          await supabase.from('traders').update({ last_sync_error: msg }).eq('id', trader.id);
          console.error(msg);
          continue;
        }


        const extractSymbol = (h: any): any =>
          h?.symbol ??
          h?.ticker ??
          h?.asset ??
          h?.assetSymbol ??
          h?.instrument ??
          h?.instrumentSymbol ??
          h?.tickerSymbol ??
          h?.underlyingSymbol ??
          h?.asset?.symbol ??
          h?.asset?.ticker ??
          h?.instrument?.symbol ??
          h?.instrument?.ticker ??
          h?.instrument?.code ??
          null;

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
              .flatMap((h: any) => normalizeSymbol(extractSymbol(h)))
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

        // If assets are missing (common on fresh DBs), create placeholder assets so holdings can be stored.
        // This is intentionally minimal: name defaults to the symbol; other fields can be enriched later.
        const canonicalSymbols = Array.from(
          new Set(
            holdings
              .map((h: any) => {
                const candidates = normalizeSymbol(extractSymbol(h));
                return candidates.length > 0 ? candidates[candidates.length - 1] : null; // cleaned
              })
              .filter(Boolean),
          ),
        ) as string[];

        const missingCanonical = canonicalSymbols.filter((s) => !symbolToAssetId.has(String(s).toUpperCase()));
        if (missingCanonical.length > 0) {
          const { error: upsertErr } = await supabase
            .from('assets')
            .upsert(
              missingCanonical.map((s) => ({ symbol: String(s).toUpperCase(), name: String(s).toUpperCase() })),
              { onConflict: 'symbol', ignoreDuplicates: true },
            );
          if (upsertErr) {
            console.error('Error upserting placeholder assets for holdings:', upsertErr);
          } else {
            const { data: createdAssets, error: createdAssetsErr } = await supabase
              .from('assets')
              .select('id, symbol')
              .in('symbol', missingCanonical.map((s) => String(s).toUpperCase()));
            if (createdAssetsErr) {
              console.error('Error re-fetching placeholder assets:', createdAssetsErr);
            } else {
              (createdAssets || []).forEach((a: any) => symbolToAssetId.set(String(a.symbol).toUpperCase(), a.id));
            }
          }
        }

        const rows = holdings
          .map((h: any) => {
            const candidates = normalizeSymbol(extractSymbol(h));
            const assetId = candidates.map((c) => symbolToAssetId.get(c)).find(Boolean) || null;
            if (!assetId) return null;
            return {
              trader_id: trader.id,
              asset_id: assetId,
              allocation_pct: coerceNumber(h?.allocation ?? h?.weight ?? h?.allocation_pct ?? h?.pct ?? h?.percent),
              avg_open_price: coerceNumber(h?.avg_open_price ?? h?.avgOpenPrice ?? h?.avgPrice ?? h?.openPrice),
              current_value: coerceNumber(h?.current_value ?? h?.currentValue ?? h?.marketValue ?? h?.value ?? h?.equity ?? h?.positionValue),
              profit_loss_pct: coerceNumber(h?.profitLossPct ?? h?.profitLoss ?? h?.pnlPct ?? h?.pnl ?? h?.profit_loss_pct),
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
