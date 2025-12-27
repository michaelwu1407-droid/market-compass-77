import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!alphaVantageApiKey) {
      throw new Error('Alpha Vantage API key is not set')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${alphaVantageApiKey}`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch data from Alpha Vantage: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.note) {
      throw new Error(`Alpha Vantage API limit reached: ${data.note}`)
    }

    const marketMovers = [
      ...data.top_gainers.map((g: any) => ({ ...g, type: 'gainer' })),
      ...data.top_losers.map((l: any) => ({ ...l, type: 'loser' })),
      ...data.most_actively_traded.map((t: any) => ({ ...t, type: 'active' })),
    ]

    const { error: deleteError } = await supabaseAdmin.from('market_movers').delete().neq('id', 0) 

    if (deleteError) {
      console.error('Error deleting old market movers:', deleteError)
    }

    const { error: upsertError } = await supabaseAdmin
      .from('market_movers')
      .upsert(marketMovers, { onConflict: 'ticker' })

    if (upsertError) {
      throw upsertError
    }

    return new Response(JSON.stringify({ success: true, upserted: marketMovers.length }), {
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
