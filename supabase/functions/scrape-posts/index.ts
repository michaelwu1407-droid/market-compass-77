import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapedPost {
  trader_username: string;
  content: string;
  posted_at: string;
  likes?: number;
  comments?: number;
  mentioned_symbols: string[];
  sentiment?: string;
}

function extractSymbols(text: string): string[] {
  // Match $SYMBOL or standalone uppercase symbols
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

async function scrapeEtoroFeed(firecrawlApiKey: string, traderUsernames: string[]): Promise<ScrapedPost[]> {
  const allPosts: ScrapedPost[] = [];

  for (const username of traderUsernames) {
    try {
      const url = `https://www.etoro.com/people/${username}/feed`;
      console.log(`Scraping feed for: ${username}`);

      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      });

      if (!response.ok) {
        console.error(`Firecrawl error for ${username} feed: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const markdown = data.data?.markdown || data.markdown || '';

      // Parse posts from markdown
      // eToro feed typically shows posts with content, timestamps, and engagement
      const postBlocks = markdown.split(/---|\n\n\n/).filter((block: string) => block.trim().length > 50);

      for (const block of postBlocks.slice(0, 10)) { // Limit to recent 10 posts
        const content = block.trim();
        if (content.length < 20) continue;

        // Try to extract timestamp
        const timeMatch = content.match(/(\d+)\s*(hour|minute|day|week|month)s?\s*ago/i);
        let postedAt = new Date();
        if (timeMatch) {
          const value = parseInt(timeMatch[1]);
          const unit = timeMatch[2].toLowerCase();
          if (unit.startsWith('hour')) postedAt.setHours(postedAt.getHours() - value);
          else if (unit.startsWith('minute')) postedAt.setMinutes(postedAt.getMinutes() - value);
          else if (unit.startsWith('day')) postedAt.setDate(postedAt.getDate() - value);
          else if (unit.startsWith('week')) postedAt.setDate(postedAt.getDate() - value * 7);
          else if (unit.startsWith('month')) postedAt.setMonth(postedAt.getMonth() - value);
        }

        // Extract engagement numbers
        const likesMatch = content.match(/(\d+)\s*(?:like|heart)/i);
        const commentsMatch = content.match(/(\d+)\s*comment/i);

        allPosts.push({
          trader_username: username,
          content: content.substring(0, 1000), // Limit content length
          posted_at: postedAt.toISOString(),
          likes: likesMatch ? parseInt(likesMatch[1]) : 0,
          comments: commentsMatch ? parseInt(commentsMatch[1]) : 0,
          mentioned_symbols: extractSymbols(content),
          sentiment: analyzeSentiment(content),
        });
      }

      console.log(`Scraped ${postBlocks.length} posts for ${username}`);

    } catch (error) {
      console.error(`Error scraping ${username} feed:`, error);
    }
  }

  return allPosts;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get trader usernames to scrape
    let usernames: string[] = [];
    try {
      const body = await req.json();
      usernames = body.usernames || [];
    } catch {
      // No body - get all traders from DB
    }

    if (usernames.length === 0) {
      const { data: traders } = await supabase
        .from('traders')
        .select('etoro_username')
        .limit(20); // Limit to prevent rate limiting
      
      usernames = (traders || []).map(t => t.etoro_username);
    }

    console.log(`Scraping posts for ${usernames.length} traders`);

    const scrapedPosts = await scrapeEtoroFeed(FIRECRAWL_API_KEY, usernames);
    console.log(`Total scraped posts: ${scrapedPosts.length}`);

    // Get trader IDs mapping
    const { data: traders } = await supabase
      .from('traders')
      .select('id, etoro_username');
    
    const traderMap = new Map((traders || []).map(t => [t.etoro_username, t.id]));

    // Prepare posts for insertion
    const postsToInsert = scrapedPosts
      .filter(post => traderMap.has(post.trader_username))
      .map(post => ({
        trader_id: traderMap.get(post.trader_username),
        content: post.content,
        posted_at: post.posted_at,
        likes: post.likes || 0,
        comments: post.comments || 0,
        mentioned_symbols: post.mentioned_symbols,
        sentiment: post.sentiment,
        source: 'etoro',
      }));

    if (postsToInsert.length > 0) {
      // Insert new posts (avoiding duplicates via content matching would need a unique constraint)
      const { data: inserted, error } = await supabase
        .from('posts')
        .insert(postsToInsert)
        .select();

      if (error) {
        console.error('Error inserting posts:', error);
        throw error;
      }

      console.log(`Inserted ${inserted?.length || 0} posts`);

      return new Response(
        JSON.stringify({
          success: true,
          traders_processed: usernames.length,
          posts_scraped: scrapedPosts.length,
          posts_inserted: inserted?.length || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        traders_processed: usernames.length,
        posts_scraped: scrapedPosts.length,
        posts_inserted: 0,
        message: 'No matching posts to insert',
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
