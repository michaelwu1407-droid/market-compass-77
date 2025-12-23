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

// Clean escaped markdown characters from Firecrawl
function cleanEscapedContent(content: string): string {
  return content
    .replace(/\\\\/g, '\n')    // \\ -> newline
    .replace(/\\_/g, '_')       // \_ -> underscore
    .replace(/\\n/g, '\n')      // Literal \n string -> newline
    .replace(/\\\[/g, '[')      // \[ -> bracket
    .replace(/\\\]/g, ']')      // \] -> bracket
    .replace(/\\\*/g, '*')      // \* -> asterisk
    .replace(/\\#/g, '#')       // \# -> hash
    .replace(/\\-/g, '-');      // \- -> dash
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

      // Aggressively clean non-post content
      const cleanedMarkdown = markdown
        // Remove Similar Traders sections entirely
        .replace(/Similar Traders[\s\S]*?(?=\n#{1,3}\s|\n\n\n|$)/gi, '')
        // Remove Performance tables
        .replace(/Performance \(Since.*?\)[\s\S]*?(?=\n#{1,3}\s|\n\n\n|$)/gi, '')
        .replace(/Performance\s*\n\s*\|[\s\S]*?(?=\n\n\n|$)/gi, '')
        // Remove all markdown tables (stats, performance)
        .replace(/\|[^|]+\|[^|]+\|.*\n?/g, '')
        .replace(/^\s*[-|:]+\s*$/gm, '')
        // Remove navigation and UI elements
        .replace(/Follow\s+Copy/gi, '')
        .replace(/Copy Trader/gi, '')
        .replace(/Risk Score:?\s*\d+/gi, '')
        .replace(/Copiers:?\s*[\d,]+/gi, '')
        .replace(/AUM:?\s*\$?[\d,]+[KMB]?/gi, '')
        // Remove stats lines
        .replace(/^\s*(?:Risk|AUM|Return|Profit|Loss|Trades?|Portfolio):\s*.*$/gmi, '')
        // Remove boilerplate text
        .replace(/People who copy .* also copy/gi, '')
        .replace(/Top instruments traded/gi, '')
        .replace(/\[Copy\]/gi, '')
        .replace(/\[Follow\]/gi, '')
        // Remove image markdown
        .replace(/!\[.*?\]\(.*?\)/g, '')
        // Remove consecutive newlines
        .replace(/\n{4,}/g, '\n\n\n');
      
      // Split into post blocks and filter
      const postBlocks = cleanedMarkdown.split(/---|\n\n\n/).filter((block: string) => {
        const trimmed = block.trim();
        // Must have real content (not just stats or nav)
        if (trimmed.length < 50) return false;
        // Skip navigation-like content
        if (/^(Stats|About|Portfolio|Feed|Log in|Register|Copy|Follow)$/i.test(trimmed)) return false;
        // Skip if mostly numbers/stats
        const alphaRatio = (trimmed.match(/[a-zA-Z]/g) || []).length / trimmed.length;
        if (alphaRatio < 0.3) return false;
        // Skip if contains boilerplate patterns
        if (/Similar Traders|People who copy|Top instruments/i.test(trimmed)) return false;
        return true;
      });

      for (const block of postBlocks.slice(0, 10)) {
        const content = block.trim();
        if (content.length < 30) continue;

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

        const likesMatch = content.match(/(\d+)\s*(?:like|heart)/i);
        const commentsMatch = content.match(/(\d+)\s*comment/i);

        allPosts.push({
          trader_username: username,
          content: cleanEscapedContent(content).substring(0, 1000),
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
      throw new Error('FIRECRAWL_API_KEY is not configured - this function requires Firecrawl');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Parse request options
    let usernames: string[] = [];
    let traderLimit = 10; // Default: only scrape top 10 traders to save credits
    
    try {
      const body = await req.json();
      usernames = body.usernames || [];
      traderLimit = body.traderLimit ?? 10;
    } catch {
      // No body
    }

    if (usernames.length === 0) {
      // Get traders from DB, ordered by copiers (most popular first)
      const { data: traders } = await supabase
        .from('traders')
        .select('etoro_username, copiers')
        .order('copiers', { ascending: false })
        .limit(traderLimit);
      
      usernames = (traders || []).map(t => t.etoro_username);
    }

    console.log(`Scraping posts for ${usernames.length} traders (limit: ${traderLimit})`);
    console.log(`Estimated Firecrawl credits: ~${usernames.length}`);

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
          firecrawl_credits_used: usernames.length,
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
        firecrawl_credits_used: usernames.length,
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
