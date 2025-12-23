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
  content_hash: string;
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

// Generate a hash for content to detect duplicates
async function generateContentHash(username: string, content: string): Promise<string> {
  // Use first 200 chars of cleaned content + username for hash
  const normalizedContent = content
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .substring(0, 200);
  
  const data = new TextEncoder().encode(`${username}:${normalizedContent}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Clean content server-side - extract only actual post text
function extractPostContent(rawContent: string): string {
  let content = rawContent;
  
  // Remove all boilerplate sections AGGRESSIVELY
  const boilerplatePatterns = [
    // Navigation and headers
    /^.*?(?=\[?\d+[hdwmy]\]?|\d+\s*(?:hour|minute|day|week|month)s?\s*ago)/is,
    // Similar Traders section
    /Similar Traders[\s\S]*/gi,
    /People who copy[\s\S]*/gi,
    // Performance tables
    /Performance[\s\S]*?(?:\n\n\n|$)/gi,
    /\|[^|]+\|[^|]+\|.*\n?/g,
    /^\s*[-|:]+\s*$/gm,
    // Stats blocks
    /(?:Risk|AUM|Return|Profit|Loss|Trades?|Portfolio|Copiers|Weekly DD|Daily DD|Max DD)[\s:]+[\d.,]+%?[KMB]?/gi,
    // Profile headers
    /\[@?[\w-]+\]\([^)]+\)/g,
    /!\[.*?\]\([^)]*\)/g,
    // Action buttons
    /\[?(?:Copy|Follow|Like|Share|Comment|Reply)\]?/gi,
    /Copy Trader/gi,
    // Navigation items
    /^(?:Stats|About|Portfolio|Feed|Log in|Register|Home|Markets?)$/gmi,
    // Risk score badges
    /Risk Score:?\s*\d+/gi,
    // Top instruments
    /Top instruments[\s\S]*?(?:\n\n|$)/gi,
    // Allocation tables
    /(?:Stocks?|ETFs?|Crypto|Commodities|Currencies)\s*[\d.]+%/gi,
    // Time markers (but keep the content after)
    /(?:Posted|Updated)\s*(?:\d+\s*(?:hour|minute|day|week|month)s?\s*ago)?/gi,
    // Link markdown
    /\[([^\]]+)\]\([^)]+\)/g,
    // Multiple newlines
    /\n{3,}/g,
  ];
  
  for (const pattern of boilerplatePatterns) {
    content = content.replace(pattern, (match, p1) => {
      // For link markdown, keep the text
      if (pattern.source.includes('\\[([^\\]]+)\\]')) {
        return p1 || '';
      }
      return '\n';
    });
  }
  
  // Clean up escaped markdown
  content = content
    .replace(/\\\\/g, '\n')
    .replace(/\\_/g, '_')
    .replace(/\\n/g, '\n')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\*/g, '*')
    .replace(/\\#/g, '#')
    .replace(/\\-/g, '-');
  
  // Remove lines that are just numbers or stats
  const lines = content.split('\n').filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.length < 3) return false;
    // Skip lines that are mostly numbers/percentages
    if (/^[\d.,\s%$+-]+$/.test(trimmed)) return false;
    // Skip single word navigational items
    if (/^(?:Stats|Feed|Portfolio|About|Copy|Follow)$/i.test(trimmed)) return false;
    return true;
  });
  
  content = lines.join('\n').trim();
  
  // Remove any remaining leading/trailing whitespace and normalize
  content = content
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
  
  return content;
}

// Check if content looks like a real post
function isValidPost(content: string): boolean {
  if (content.length < 30) return false;
  if (content.length > 2000) return false;
  
  // Must have enough letters (not just numbers/symbols)
  const letters = (content.match(/[a-zA-Z]/g) || []).length;
  const alphaRatio = letters / content.length;
  if (alphaRatio < 0.4) return false;
  
  // Must not be mostly boilerplate
  const boilerplateIndicators = [
    'Similar Traders',
    'People who copy',
    'Top instruments',
    'Risk Score',
    'Copy Trader',
  ];
  for (const indicator of boilerplateIndicators) {
    if (content.includes(indicator)) return false;
  }
  
  // Should have at least 3 words
  const words = content.split(/\s+/).filter(w => w.length > 2);
  if (words.length < 3) return false;
  
  return true;
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

      // Split by common post separators
      const rawBlocks = markdown.split(/---|\n\n\n+|\n(?=\[?\d+[hdwmy]\])/);
      
      let validPostsFound = 0;
      for (const block of rawBlocks) {
        if (validPostsFound >= 5) break; // Max 5 posts per trader
        
        const content = extractPostContent(block);
        
        if (!isValidPost(content)) {
          continue;
        }

        // Parse timestamp
        const timeMatch = block.match(/\[?(\d+)\s*([hdwmy])\]?|(\d+)\s*(hour|minute|day|week|month)s?\s*ago/i);
        let postedAt = new Date();
        if (timeMatch) {
          const value = parseInt(timeMatch[1] || timeMatch[3]);
          const unit = (timeMatch[2] || timeMatch[4] || '').toLowerCase();
          if (unit === 'h' || unit.startsWith('hour')) postedAt.setHours(postedAt.getHours() - value);
          else if (unit === 'm' || unit.startsWith('minute')) postedAt.setMinutes(postedAt.getMinutes() - value);
          else if (unit === 'd' || unit.startsWith('day')) postedAt.setDate(postedAt.getDate() - value);
          else if (unit === 'w' || unit.startsWith('week')) postedAt.setDate(postedAt.getDate() - value * 7);
          else if (unit === 'y' || unit.startsWith('month')) postedAt.setMonth(postedAt.getMonth() - value);
        }

        // Extract likes - try multiple formats
        const likesMatch = block.match(/(?:❤️|👍|♥|💙|🔥)\s*(\d+)/i) ||
                          block.match(/(\d+)\s*(?:like|heart|❤)/i) ||
                          block.match(/(\d+)\s*Like/);
        
        // Extract comments - try multiple formats  
        const commentsMatch = block.match(/💬\s*(\d+)/i) ||
                             block.match(/(\d+)\s*comment/i) ||
                             block.match(/(\d+)\s*Comment/);

        // Check for truncation (Show More patterns)
        const isTruncated = /(?:Show [Mm]ore|Read [Mm]ore|\.{3}$|…$)/.test(block);
        let finalContent = content.substring(0, 1000);
        if (isTruncated && finalContent.length > 50) {
          // Mark truncated posts so we know they're partial
          finalContent = finalContent.replace(/\.{3}$|…$/, '');
          if (!finalContent.endsWith('[...]')) {
            finalContent += ' [...]';
          }
        }
        
        const contentHash = await generateContentHash(username, content);

        allPosts.push({
          trader_username: username,
          content: finalContent,
          posted_at: postedAt.toISOString(),
          likes: likesMatch ? parseInt(likesMatch[1]) : 0,
          comments: commentsMatch ? parseInt(commentsMatch[1]) : 0,
          mentioned_symbols: extractSymbols(content),
          sentiment: analyzeSentiment(content),
          content_hash: contentHash,
        });
        
        validPostsFound++;
      }

      console.log(`Found ${validPostsFound} valid posts for ${username}`);

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
    let traderLimit = 10;
    
    try {
      const body = await req.json();
      usernames = body.usernames || [];
      traderLimit = body.traderLimit ?? 10;
    } catch {
      // No body
    }

    if (usernames.length === 0) {
      const { data: traders } = await supabase
        .from('traders')
        .select('etoro_username, copiers')
        .order('copiers', { ascending: false })
        .limit(traderLimit);
      
      usernames = (traders || []).map(t => t.etoro_username);
    }

    console.log(`Scraping posts for ${usernames.length} traders (limit: ${traderLimit})`);

    const scrapedPosts = await scrapeEtoroFeed(FIRECRAWL_API_KEY, usernames);
    console.log(`Total scraped posts: ${scrapedPosts.length}`);

    // Get trader IDs mapping
    const { data: traders } = await supabase
      .from('traders')
      .select('id, etoro_username');
    
    const traderMap = new Map((traders || []).map(t => [t.etoro_username, t.id]));

    // Check for existing posts by content hash (stored in etoro_post_id)
    const contentHashes = scrapedPosts.map(p => p.content_hash);
    const { data: existingPosts } = await supabase
      .from('posts')
      .select('etoro_post_id')
      .in('etoro_post_id', contentHashes);
    
    const existingHashes = new Set((existingPosts || []).map(p => p.etoro_post_id));
    
    // Filter out duplicates
    const newPosts = scrapedPosts.filter(post => 
      traderMap.has(post.trader_username) && 
      !existingHashes.has(post.content_hash)
    );
    
    console.log(`New posts to insert: ${newPosts.length} (${scrapedPosts.length - newPosts.length} duplicates skipped)`);

    // Prepare posts for insertion (use content_hash as etoro_post_id for dedup)
    const postsToInsert = newPosts.map(post => ({
      trader_id: traderMap.get(post.trader_username),
      content: post.content,
      posted_at: post.posted_at,
      likes: post.likes || 0,
      comments: post.comments || 0,
      mentioned_symbols: post.mentioned_symbols,
      sentiment: post.sentiment,
      source: 'etoro',
      etoro_post_id: post.content_hash, // Use hash as unique ID
    }));

    let insertedCount = 0;
    if (postsToInsert.length > 0) {
      const { data: inserted, error } = await supabase
        .from('posts')
        .insert(postsToInsert)
        .select();

      if (error) {
        console.error('Error inserting posts:', error);
        throw error;
      }

      insertedCount = inserted?.length || 0;
      console.log(`Inserted ${insertedCount} new posts`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        traders_processed: usernames.length,
        posts_scraped: scrapedPosts.length,
        posts_inserted: insertedCount,
        duplicates_skipped: scrapedPosts.length - newPosts.length,
        firecrawl_credits_used: usernames.length,
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
