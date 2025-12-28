import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProbeResult = {
  name: string;
  url: string;
  ok: boolean;
  status: number;
  elapsed_ms: number;
  content_type: string | null;
  bytes: number;
  json_summary?: {
    top_level_keys?: string[];
    detected_series?: Array<{ path: string; sample_keys: string[]; length: number }>;
  };
  error?: string;
};

function safeJsonParse(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || String(e) };
  }
}

function getTopLevelKeys(v: any): string[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.keys(v).slice(0, 50);
}

function detectSeries(root: any): Array<{ path: string; sample_keys: string[]; length: number }> {
  const results: Array<{ path: string; sample_keys: string[]; length: number }> = [];

  // Walk a limited portion of the JSON to avoid huge payload costs.
  const maxNodes = 2500;
  let visited = 0;
  const stack: Array<{ v: any; path: string }> = [{ v: root, path: '$' }];

  const looksLikeSeriesItem = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    const hasDateish = keys.some((k) => /date|time|timestamp/i.test(k));
    const hasNumberish = keys.some((k) => {
      const val = (obj as any)[k];
      return typeof val === 'number' && Number.isFinite(val);
    });
    return hasDateish && hasNumberish;
  };

  while (stack.length > 0 && visited < maxNodes) {
    const { v, path } = stack.pop()!;
    visited++;

    if (Array.isArray(v)) {
      const first = v[0];
      if (v.length >= 5 && looksLikeSeriesItem(first)) {
        results.push({
          path,
          sample_keys: Object.keys(first).slice(0, 30),
          length: v.length,
        });
      }
      // Still traverse a couple of elements to find nested series.
      for (let i = 0; i < Math.min(3, v.length); i++) {
        stack.push({ v: v[i], path: `${path}[${i}]` });
      }
      continue;
    }

    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (visited >= maxNodes) break;
        stack.push({ v: child, path: `${path}.${k}` });
      }
    }
  }

  return results.slice(0, 20);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    const envUrl = Deno.env.get('SUPABASE_URL');
    const supabaseUrl = envUrl && envUrl.length > 0 ? envUrl : new URL(req.url).origin;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const requestedCid = (body?.cid ?? body?.CID ?? body?.customerId ?? body?.CustomerId ?? '')?.toString().trim();
    const requestedUsername = (body?.username ?? '')?.toString().trim();

    // Resolve missing identifiers from DB when possible
    let cid = requestedCid;
    let username = requestedUsername;

    if (!cid && username) {
      const { data, error } = await supabase
        .from('traders')
        .select('etoro_cid')
        .eq('etoro_username', username)
        .maybeSingle();
      if (error) throw error;
      cid = data?.etoro_cid ? String(data.etoro_cid) : '';
    }

    if (!username && cid) {
      const { data, error } = await supabase
        .from('traders')
        .select('etoro_username')
        .eq('etoro_cid', cid)
        .maybeSingle();
      if (error) throw error;
      username = data?.etoro_username ? String(data.etoro_username) : '';
    }

    const timeoutMs = Number(body?.timeout_ms ?? 15000);
    const periods = Array.isArray(body?.periods)
      ? body.periods.map((p: any) => String(p))
      : ['OneYearAgo', 'TwoYearsAgo', 'FiveYearsAgo', 'YTD', 'OneMonthAgo'];

    const etoroHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    const customEndpoints: Array<{ name: string; url: string }> = [];
    const envEndpointsRaw = Deno.env.get('ETORO_PROBE_ENDPOINTS');
    if (envEndpointsRaw) {
      const parsed = safeJsonParse(envEndpointsRaw);
      if (parsed.ok && Array.isArray(parsed.value)) {
        for (const entry of parsed.value) {
          if (entry && typeof entry === 'object' && typeof entry.url === 'string') {
            customEndpoints.push({ name: String(entry.name || entry.url), url: entry.url });
          } else if (typeof entry === 'string') {
            customEndpoints.push({ name: entry, url: entry });
          }
        }
      }
    }

    const endpoints: Array<{ name: string; url: string }> = [];

    // Rankings-by-CID with multiple periods (public, stable)
    if (cid) {
      for (const period of periods) {
        endpoints.push({
          name: `rankings_${period}`,
          url: `https://www.etoro.com/sapi/rankings/cid/${encodeURIComponent(cid)}/rankings?period=${encodeURIComponent(period)}`,
        });
      }
    }

    // Optional profile endpoint template (whatever the project already uses)
    const profileTemplate = Deno.env.get('ETORO_TRADER_PROFILE_URL');
    if (profileTemplate) {
      const url = profileTemplate
        .replaceAll('{cid}', encodeURIComponent(cid || ''))
        .replaceAll('{username}', encodeURIComponent(username || ''));
      endpoints.push({ name: 'profile_template', url });
    }

    // User-provided extra endpoints (request body)
    const bodyEndpoints = Array.isArray(body?.endpoints) ? body.endpoints : [];
    for (const e of bodyEndpoints) {
      if (!e) continue;
      if (typeof e === 'string') {
        endpoints.push({ name: e, url: e });
      } else if (typeof e === 'object' && typeof e.url === 'string') {
        endpoints.push({ name: String(e.name || e.url), url: String(e.url) });
      }
    }

    endpoints.push(...customEndpoints);

    const filled = endpoints
      .map((e) => ({
        name: e.name,
        url: e.url
          .replaceAll('{cid}', encodeURIComponent(cid || ''))
          .replaceAll('{username}', encodeURIComponent(username || '')),
      }))
      .filter((e) => e.url && !e.url.includes('{cid}') && !e.url.includes('{username}'));

    const results: ProbeResult[] = [];

    for (const ep of filled) {
      const started = Date.now();
      try {
        const resp = await fetch(ep.url, { headers: etoroHeaders, signal: AbortSignal.timeout(timeoutMs) });
        const contentType = resp.headers.get('content-type');
        const text = await resp.text().catch(() => '');
        const elapsedMs = Date.now() - started;

        const r: ProbeResult = {
          name: ep.name,
          url: ep.url,
          ok: resp.ok,
          status: resp.status,
          elapsed_ms: elapsedMs,
          content_type: contentType,
          bytes: text.length,
        };

        if (resp.ok && contentType && contentType.includes('application/json') && text) {
          const parsed = safeJsonParse(text);
          if (parsed.ok === true) {
            const v = parsed.value;
            r.json_summary = {
              top_level_keys: getTopLevelKeys(v),
              detected_series: detectSeries(v),
            };
          } else {
            const err = (parsed as { ok: false; error: string }).error;
            r.error = `JSON parse failed: ${err}`;
          }
        } else if (!resp.ok) {
          r.error = text.substring(0, 400);
        }

        results.push(r);
      } catch (e) {
        results.push({
          name: ep.name,
          url: ep.url,
          ok: false,
          status: 0,
          elapsed_ms: Date.now() - started,
          content_type: null,
          bytes: 0,
          error: (e as Error)?.message || String(e),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        resolved: { cid: cid || null, username: username || null },
        attempted: results.length,
        results,
        note: 'This is a probe utility. Prefer stable /sapi/rankings endpoints; other endpoints may be blocked or change without notice.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
