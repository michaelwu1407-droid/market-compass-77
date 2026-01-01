import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? new URL(req.url).origin;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const requestAuth = req.headers.get('authorization') || req.headers.get('Authorization');
    const requestApiKey = req.headers.get('apikey') || req.headers.get('x-api-key');

    // Prefer service role for server-side invocations; fall back to anon; then to forwarded headers.
    // This avoids hard-failing cron/automation when SUPABASE_ANON_KEY isn't configured.
    const bearerToken = supabaseServiceRoleKey || supabaseAnonKey || null;
    const authHeader = bearerToken
      ? `Bearer ${bearerToken}`
      : (requestAuth || null);
    const apiKeyHeader = supabaseAnonKey || requestApiKey || null;

    if (!authHeader && !apiKeyHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing Supabase credentials (set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY, or provide Authorization/apikey headers)',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.text();

    const resp = await fetch(`${supabaseUrl}/functions/v1/enqueue-sync-jobs`, {
      method: 'POST',
      headers: {
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        ...(apiKeyHeader ? { 'apikey': apiKeyHeader } : {}),
        'Content-Type': 'application/json',
      },
      body: body && body.length > 0 ? body : '{}',
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
