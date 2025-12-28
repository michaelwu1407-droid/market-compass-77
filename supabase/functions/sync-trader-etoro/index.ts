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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || '').trim();
    if (!username) {
      return new Response(JSON.stringify({ success: false, error: 'Missing username' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const profileUrl = profileUrlTemplate.replaceAll('{username}', encodeURIComponent(username));
    const res = await fetch(profileUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
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
    const root = json?.data ?? json?.user ?? json?.profile ?? json;

    const etoroCid = pick(root, ['customerId', 'CustomerId', 'cid', 'CID', 'etoroCid', 'etoro_cid']);
    const displayName = pick(root, ['displayName', 'fullName', 'name']);
    const avatarUrl = pick(root, ['avatarUrl', 'avatar', 'image', 'picture', 'profileImage', 'photo']);
    const country = pick(root, ['country', 'location']);
    const winRatio = asNumber(pick(root, ['winRatio', 'win_ratio', 'win_rate', 'winRate'])) ;

    // Only update fields we know; keep existing values otherwise.
    const upsert: Record<string, any> = {
      etoro_username: username,
      updated_at: new Date().toISOString(),
      last_etoro_sync_at: new Date().toISOString(),
      trader_source: 'etoro',
    };
    if (etoroCid) upsert.etoro_cid = String(etoroCid);
    if (displayName) upsert.display_name = String(displayName);
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
