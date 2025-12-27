import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // This is an example of a POST request handler.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { record } = await req.json()
    const traderId = record.trader_id

    if (!traderId) {
      throw new Error('trader_id is required')
    }

    // Create a Supabase client with the user's access token
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: holdings, error: holdingsError } = await supabaseAdmin
      .from('trader_holdings')
      .select('current_value')
      .eq('trader_id', traderId)

    if (holdingsError) {
      throw holdingsError
    }

    const totalAum = holdings.reduce((acc, holding) => acc + (holding.current_value || 0), 0)

    const { error: updateError } = await supabaseAdmin
      .from('traders')
      .update({ total_aum: totalAum })
      .eq('id', traderId)

    if (updateError) {
      throw updateError
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
