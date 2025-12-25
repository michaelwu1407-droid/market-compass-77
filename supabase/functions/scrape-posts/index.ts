import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractSymbols(text: string): string[] {
  const dollarSymbols = text.match(/\$([A-Z]{1,5})/g) || [];
  const symbols = dollarSymbols.map(s => s.replace('$', ''));
  return [...new Set(symbols)];
}

function analyzeSentiment(text: string): string {
  const lowerText = text.toLowerCase();
  const bullishWords = ['buy', 'long', 'bullish', 'moon', 'pump', 'growth', 'profit', 'gains', 'up', 'rally'];
  const bearishWords = ['sell', 'short', 'bearish', 'dump', 'crash', 'loss', 'down', 'drop', 'correction'];
  
  let bullScore = 0;
  let bearScore = 0;
  
  for (const word of bullishWords) {
    if (lowerText.includes(word)) bullScore++;
  }
  for (const word of bearishWords) {
    if (lowerText.includes(word)) bearScore++;
  }
  
  if (bullScore > bearScore) return 'bullish';
  if (bearScore > bullScore) return 'bearish';
  return 'neutral';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase environment variables are not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Fetching eToro popular investors feed...');

    const etoroApiUrl = 'https://www.etoro.com/api/edm-streams/v1/feed/popularInvestors?take=50&offset=0&reactionsPageSize=20&badgesExperimentIsEnabled=false&client_request_id=91ee987f-1f29-4bca-873e-d78aae9bd7f4';
    
    const response = await fetch(etoroApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`eToro API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const discussions = data.discussions || [];
    
    console.log(`Received ${discussions.length} discussions from eToro`);

    // Get all traders to map usernames to IDs
    const { data: traders } = await supabase
      .from('traders')
      .select('id, etoro_username');
    
    const traderMap = new Map((traders || []).map(t => [t.etoro_username.toLowerCase(), t.id]));

    const postsToInsert = [];
    
    for (const item of discussions) {
      const post = item.post;
      if (!post) continue;

      const username = post.owner?.username?.toLowerCase();
      const traderId = traderMap.get(username);
      
      // We only care about posts from traders in our database
      if (!traderId) {
        console.log(`Skipping post from unknown trader: ${username}`);
        continue;
      }

      postsToInsert.push({
        trader_id: traderId,
        content: post.content,
        posted_at: post.published,
        likes: item.reactionsCount || 0,
        comments: item.commentsCount || 0,
        mentioned_symbols: extractSymbols(post.content),
        sentiment: analyzeSentiment(post.content),
        source: 'etoro',
        etoro_post_id: item.id, // Using the discussion ID as the unique eToro post ID
      });
    }

    console.log(`Prepared ${postsToInsert.length} posts for insertion`);

    let insertedCount = 0;
    if (postsToInsert.length > 0) {
      // Upsert to avoid duplicates based on etoro_post_id
      const { data: inserted, error } = await supabase
        .from('posts')
        .upsert(postsToInsert, { 
          onConflict: 'etoro_post_id',
          ignoreDuplicates: true 
        })
        .select();

      if (error) {
        console.error('Error upserting posts:', error);
        throw error;
      }

      insertedCount = inserted?.length || 0;
      console.log(`Successfully processed ${insertedCount} new posts`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        posts_scraped: discussions.length,
        posts_processed: postsToInsert.length,
        posts_inserted: insertedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-posts:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
