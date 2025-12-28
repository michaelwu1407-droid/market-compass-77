/// <reference path="../edge-runtime.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t && /^-?\d+(\.\d+)?$/.test(t)) {
      const n = Number(t);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function firstArrayItem(v: any): any {
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const requestedUsername = String(body.username || '').trim();
    const requestedCidRaw = body.cid ?? body.CID ?? body.customerId ?? body.CustomerId;
    const requestedCid = requestedCidRaw !== undefined && requestedCidRaw !== null && String(requestedCidRaw).trim() !== ''
      ? String(requestedCidRaw).trim()
      : '';

    const envUrl = Deno.env.get('SUPABASE_URL');
    const SUPABASE_URL = envUrl && envUrl.length > 0 ? envUrl : new URL(req.url).origin;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // We intentionally do NOT hardcode any private/unstable eToro endpoints here.
    // Configure an endpoint template via env:
    //   ETORO_TRADER_PROFILE_URL (supports {username} placeholder)
    const profileUrlTemplate = Deno.env.get('ETORO_TRADER_PROFILE_URL');
    if (!profileUrlTemplate) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ETORO_TRADER_PROFILE_URL not configured',
          message: 'Set ETORO_TRADER_PROFILE_URL env var to enable eToro syncing',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve username if caller only provided CID (so we can upsert via onConflict: etoro_username)
    let username = requestedUsername;
    if (!username && requestedCid) {
      const { data: existing, error: lookupError } = await supabase
        .from('traders')
        .select('etoro_username')
        .eq('etoro_cid', requestedCid)
        .maybeSingle();
      if (lookupError) throw lookupError;
      username = String(existing?.etoro_username || '').trim();
    }

    if (!username && profileUrlTemplate.includes('{username}')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing username' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!requestedCid && profileUrlTemplate.includes('{cid}')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing cid' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileUrl = profileUrlTemplate
      .replaceAll('{username}', encodeURIComponent(username))
      .replaceAll('{cid}', encodeURIComponent(requestedCid));

    const etoroHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    const res = await fetch(profileUrl, {
      headers: etoroHeaders,
      signal: AbortSignal.timeout(15000),
    });

    const raw = await res.text().catch(() => '');
    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `eToro HTTP ${res.status}`, body: raw.substring(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let json: any = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to parse eToro JSON', body: raw.substring(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Best-effort extraction (response shape varies by endpoint)
    // - Rankings by CID often returns objects containing { CID, Value: {...} }
    // - Search endpoint typically returns an array
    const rootCandidate = json?.data ?? json?.user ?? json?.profile ?? json;
    const root = Array.isArray(rootCandidate)
      ? (rootCandidate[0] ?? {})
      : rootCandidate;

    // Some endpoints return { Items: [...] }, others return { CID, Value: {...} }, and search returns arrays.
    let v: any = (root as any)?.Value ?? (root as any)?.value ?? root;
    if (Array.isArray(v?.Items) && v.Items.length > 0) v = v.Items[0];
    if (Array.isArray(v?.items) && v.items.length > 0) v = v.items[0];

    // If caller didn't provide username (CID-only path), try to derive from response.
    if (!username) {
      const derived = pick(v, ['UserName', 'userName', 'username']) ?? pick(root, ['UserName', 'userName', 'username']);
      if (derived) username = String(derived).trim();
    }

    // If username is still missing, we cannot safely upsert (etoro_username is the conflict key).
    if (!username) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unable to resolve username for CID',
          cid: requestedCid || null,
          message: 'Provide { "username": "..." } or ensure the CID endpoint returns UserName',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let etoroCid = (pick(root, ['CID', 'cid']) ?? pick(v, ['CustomerId', 'customerId', 'customerID', 'CID', 'cid']) ?? (requestedCid || null));
    const usernameFromPayload = pick(v, ['UserName', 'userName', 'username']) ?? pick(root, ['UserName', 'userName', 'username']);
    if (!username && usernameFromPayload) {
      username = String(usernameFromPayload).trim();
    }
    const displayName = pick(v, ['displayName', 'DisplayName', 'FullName', 'fullName', 'name']);
    const avatarUrl = pick(v, ['avatarUrl', 'avatar', 'image', 'picture', 'profileImage', 'photo']);
    const country = pick(v, ['country', 'location']);
    let winRatio = asNumber(pick(v, ['WinRatio', 'winRatio', 'win_ratio', 'win_rate', 'winRate']));

    // If the template is a search endpoint (array response), try to extract CID from common shapes.
    // Some search responses are like: [{ cid: 123, username: 'foo', ... }]
    if (!etoroCid) {
      const first = firstArrayItem(rootCandidate);
      const fromFirst = pick(first, ['CID', 'cid', 'customerId', 'CustomerId', 'customerID']);
      if (fromFirst) etoroCid = String(fromFirst);
    }

    // Optional enrichment via stable rankings-by-CID endpoint (public OpenAPI documented).
    // This helps when the search endpoint is missing fields like WinRatio.
    if (etoroCid) {
      try {
        const rankingsUrl = `https://www.etoro.com/sapi/rankings/cid/${encodeURIComponent(String(etoroCid))}/rankings?period=OneYearAgo`;
        const rRes = await fetch(rankingsUrl, { headers: etoroHeaders, signal: AbortSignal.timeout(15000) });
        if (rRes.ok) {
          const rRaw = await rRes.text().catch(() => '');
          const rJson = rRaw ? JSON.parse(rRaw) : {};
          const rRoot = rJson?.data ?? rJson?.value ?? rJson;
          const rV = (rRoot as any)?.Value ?? (rRoot as any)?.value ?? rRoot;
          const wr = asNumber(pick(rV, ['WinRatio', 'winRatio', 'win_rate', 'winRatioPct']));
          if (wr !== null) winRatio = wr;
        }
      } catch (_e) {
        // Best-effort only
      }
    }

    if (!username) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unable to determine username for upsert',
          message: 'Provide username, or ensure traders.etoro_cid maps to an existing row, or use a CID endpoint that returns Value.UserName',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Only update fields we know; keep existing values otherwise.
    const upsert: Record<string, any> = {
      etoro_username: username,
      display_name: String(displayName || username),
      updated_at: new Date().toISOString(),
      last_etoro_sync_at: new Date().toISOString(),
      trader_source: 'etoro',
    };
    if (etoroCid) upsert.etoro_cid = String(etoroCid);
    if (avatarUrl) upsert.avatar_url = String(avatarUrl);
    if (country) upsert.country = String(country);
    if (winRatio !== null) upsert.win_ratio = winRatio;

    const { error } = await supabase
      .from('traders')
      .upsert(upsert, { onConflict: 'etoro_username' });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, username, etoro_cid: upsert.etoro_cid ?? null, updated: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.error('[sync-trader-etoro] error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
