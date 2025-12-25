import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BULLAWARE_BASE = 'https://api.bullaware.com/v1';
const ENDPOINTS = {
  investors: `${BULLAWARE_BASE}/investors`,
};

const BATCH_SIZE = 50; // Fetch 50 traders per page

interface SyncState {
  id: string;
  last_page: number;
}

// Helper function to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 30000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bullwareApiKey = Deno.env.get('BULLAWARE_API_KEY');

  if (!bullwareApiKey) {
    return new Response(JSON.stringify({ error: 'BULLAWARE_API_KEY not set' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get current page from sync_state or default to 1
    const { data: syncState } = await supabase
      .from('sync_state')
      .select('last_page')
      .eq('id', 'traders_discovery')
      .single();

    const currentPage = syncState?.last_page || 1;
    console.log(`[Discovery] Fetching page ${currentPage}...`);

    const response = await fetchWithTimeout(`${ENDPOINTS.investors}?page=${currentPage}&limit=${BATCH_SIZE}`, {
      headers: { 'Authorization': `Bearer ${bullwareApiKey}`, 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Bullaware API error: ${response.status}`);
    }

    const data = await response.json();
    const traders = data.items || data.data || data.investors || [];

    if (traders.length === 0) {
      console.log('[Discovery] No more traders found. Resetting to page 1.');
      // Reset to page 1 for next run to keep cycling
      await supabase.from('sync_state').upsert({ id: 'traders_discovery', last_page: 1 });
      return new Response(JSON.stringify({ message: 'Cycle complete, reset to page 1', count: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Prepare items for queue
    const queueItems = traders.map((t: any) => ({
      trader_id: t.username || t.userName || t.etoro_username,
      status: 'PENDING',
    }));

    if (queueItems.length > 0) {
        const usernames = queueItems.map((i: any) => i.trader_id);
        const { data: existing } = await supabase
          .from('sync_queue')
          .select('trader_id, status')
          .in('trader_id', usernames);
        
        const existingMap = new Map(existing?.map(e => [e.trader_id, e.status]));
        
        const toUpsert = queueItems.filter((item: any) => {
          const currentStatus = existingMap.get(item.trader_id);
          // If it doesn't exist, insert it.
          if (!currentStatus) return true;
          // If it exists and is COMPLETED, skip it (do not reset).
          if (currentStatus === 'COMPLETED') return false;
          // If it exists and is FAILED, reset to PENDING.
          if (currentStatus === 'FAILED') return true;
          // Skip PENDING/PROCESSING to avoid interfering with active jobs
          return false; 
        });

        if (toUpsert.length > 0) {
          const { error } = await supabase.from('sync_queue').upsert(toUpsert, { onConflict: 'trader_id' });
          if (error) throw error;
        }
        
        console.log(`[Discovery] Processed ${traders.length} traders, queued ${toUpsert.length} new/retry items.`);
    }

    // Update pagination
    await supabase.from('sync_state').upsert({ 
      id: 'traders_discovery', 
      last_page: currentPage + 1,
      updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ 
      success: true, 
      discovered: traders.length, 
      page: currentPage 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
