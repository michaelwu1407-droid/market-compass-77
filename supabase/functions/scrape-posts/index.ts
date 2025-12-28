import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function firstNumber(candidates: any[]): number {
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }
  }
  return 0;
}

function extractEngagement(item: any) {
  const post = item?.post || {};
  const metadata = post?.metadata || {};
  const stats = post?.stats || post?.statistics || metadata?.stats || metadata?.statistics || {};
  const reactions = post?.reactions || metadata?.reactions || stats?.reactions || {};
  const commentsObj = post?.comments || metadata?.comments || stats?.comments || {};

  const likes = firstNumber([
    item?.reactionsCount,
    item?.reactions?.count,
    item?.reactions?.totalCount,
    post?.reactionsCount,
    metadata?.reactionsCount,
    stats?.reactionsCount,
    reactions?.count,
    reactions?.total,
    reactions?.totalCount,
    reactions?.likes,
    reactions?.likesCount,
    reactions?.totalLikes,
  ]);

  const comments = firstNumber([
    item?.commentsCount,
    item?.comments?.count,
    item?.comments?.totalCount,
    post?.commentsCount,
    metadata?.commentsCount,
    stats?.commentsCount,
    commentsObj?.count,
    commentsObj?.total,
    commentsObj?.totalCount,
  ]);

  return {
    likes: Math.max(0, likes),
    comments: Math.max(0, comments),
  };
}

function extractSymbols(text: string | undefined | null): string[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const dollarSymbols = text.match(/\$([A-Z]{1,5})/g) || [];
  const symbols = dollarSymbols.map(s => s.replace('$', ''));
  return [...new Set(symbols)];
}

function analyzeSentiment(text: string | undefined | null): string {
  if (typeof text !== 'string' || text.length === 0) return 'neutral';
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

  // Dry-run mode: ?dry_run=1 or header 'x-dry-run: 1'
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1' || req.headers.get('x-dry-run') === '1';

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Fetching eToro popular investors feed...');

    // Increase `take` to fetch more posts and be resilient to API changes
    const etoroApiUrl = 'https://www.etoro.com/api/edm-streams/v1/feed/popularInvestors?take=200&offset=0&reactionsPageSize=20&badgesExperimentIsEnabled=false&client_request_id=91ee987f-1f29-4bca-873e-d78aae9bd7f4';
    
    const response = await fetch(etoroApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    });

    const raw = await response.text().catch(() => '');

    if (!response.ok) {
      console.error('eToro non-ok response body:', raw);
      throw new Error(`eToro API error: ${response.status} ${response.statusText}`);
    }

    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Failed to parse eToro response JSON, raw:', raw);
      throw new Error('Failed to parse eToro API response as JSON');
    }

    const discussions = data.discussions || [];
    console.log(`[feed] discussions=${discussions.length}`);
    // Debug: log keys and candidate text field lengths for first 3 items
    for (let i = 0; i < Math.min(3, discussions.length); i++) {
      const item = discussions[i];
      const post = item.post || {};
      const postKeys = Object.keys(post);
      const message = post.message || {};
      const messageKeys = typeof message === 'object' && message !== null ? Object.keys(message) : [];
      const metadata = post.metadata || {};
      const share = metadata.share || {};
      const sharedOrigin = share.sharedOriginPost || post.sharedOriginPost || null;
      const sharedOriginMsg = sharedOrigin?.message || {};
      const sharedOriginMsgKeys = typeof sharedOriginMsg === 'object' && sharedOriginMsg !== null ? Object.keys(sharedOriginMsg) : [];
      // Candidate fields
      const hasMessageText = typeof post?.message?.text === 'string';
      const lenMessageText = hasMessageText ? post.message.text.length : 0;
      const hasContent = typeof post?.content === 'string';
      const lenContent = hasContent ? post.content.length : 0;
      const hasText = typeof post?.text === 'string';
      const lenText = hasText ? post.text.length : 0;
      const hasShareOrigin = typeof sharedOrigin?.message?.text === 'string';
      const lenShareOrigin = hasShareOrigin ? sharedOrigin.message.text.length : 0;
      console.log(`[item${i}] postKeys=${JSON.stringify(postKeys)}, messageKeys=${JSON.stringify(messageKeys)}, metadataKeys=${JSON.stringify(Object.keys(metadata))}, shareKeys=${JSON.stringify(Object.keys(share))}, sharedOriginKeys=${sharedOrigin ? JSON.stringify(Object.keys(sharedOrigin)) : 'null'}, sharedOriginMsgKeys=${JSON.stringify(sharedOriginMsgKeys)}, hasMessageText=${hasMessageText} len=${lenMessageText}, hasContent=${hasContent} len=${lenContent}, hasText=${hasText} len=${lenText}, hasShareOrigin=${hasShareOrigin} originLen=${lenShareOrigin}`);
    }

    // Get all traders to map usernames to IDs
    const { data: traders } = await supabase
      .from('traders')
      .select('id, etoro_username');
    
    const traderMap = new Map((traders || []).map(t => [t.etoro_username.toLowerCase(), t.id]));

    const postsToInsert = [];
    let trackedTraderPosts = 0;
    let unknownTraderPosts = 0;
    

    function isLikelyId(s: string) {
      if (!s) return false;
      const trimmed = s.trim();
      // UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return true;
      // Long hex with dashes
      if (/^[0-9a-f\-]{20,}$/i.test(trimmed) && !/\s/.test(trimmed)) return true;
      // High hex ratio
      const hexRatio = (trimmed.replace(/[^0-9a-f]/gi, '').length / Math.max(1, trimmed.length));
      if (trimmed.length > 20 && hexRatio > 0.7) return true;
      return false;
    }

    function extractReadableText(item: any) {
      // Returns { text, source, len, classif }
      let candidates = [];
      const post = item?.post || {};
      // 1) post.message.text
      if (typeof post?.message?.text === 'string') candidates.push({text: post.message.text, source: 'post.message.text'});
      // 2) post.text
      if (typeof post?.text === 'string') candidates.push({text: post.text, source: 'post.text'});
      // 3) post.content
      if (typeof post?.content === 'string') candidates.push({text: post.content, source: 'post.content'});
      // 4) item.message.text
      if (typeof item?.message?.text === 'string') candidates.push({text: item.message.text, source: 'item.message.text'});
      // 5) metadata.share.sharedOriginPost.message.text
      const shared = post?.metadata?.share?.sharedOriginPost || post?.sharedOriginPost;
      if (typeof shared?.message?.text === 'string') candidates.push({text: shared.message.text, source: 'sharedOriginPost.message.text'});
      // 6) plausible origin keys
      const altKeys = ['originalPost','sharedPost','parentPost','repost'];
      for (const k of altKeys) {
        const alt = post?.[k];
        if (typeof alt?.message?.text === 'string') candidates.push({text: alt.message.text, source: `${k}.message.text`});
      }
      // Fallback: any string field in post
      for (const k of Object.keys(post)) {
        const v = post[k];
        if (typeof v === 'string') candidates.push({text: v, source: `post.${k}`} );
      }
      // Pick first readable
      for (const c of candidates) {
        const t = c.text?.trim() || '';
        if (!t) continue;
        if (isLikelyId(t)) return {text: t, source: c.source, len: t.length, classif: 'guid_like'};
        if (t.length >= 40) return {text: t, source: c.source, len: t.length, classif: 'readable'};
        if (t.length > 0) return {text: t, source: c.source, len: t.length, classif: 'short'};
      }
      return {text: null, source: '', len: 0, classif: 'missing'};
    }

    // Classification summary
    let summary = {readable:0, guid_like:0, short:0, missing:0, non_text:0};
    for (const item of discussions) {
      const post = item.post;
      if (!post) { summary.missing++; continue; }

      const username = post.owner?.username;
      const usernameLower = username?.toLowerCase();
      const traderId = usernameLower ? traderMap.get(usernameLower) : null;

      if (traderId) trackedTraderPosts++; else unknownTraderPosts++;

      const ext = extractReadableText(item);
      summary[ext.classif] = (summary[ext.classif] || 0) + 1;

      // Clean formatting: remove markdown escapes, trim, preserve newlines
      let cleanText = (ext.text || '').replace(/\r\n|\r/g, '\n').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
      cleanText = cleanText.replace(/\n{3,}/g, '\n\n');
      // Poster info
      const poster = post.owner || {};
      const poster_username = poster.username || 'unknown';
      const poster_id = poster.id || null;
      const poster_first = poster.firstName || '';
      const poster_last = poster.lastName || '';
      const poster_avatar = poster.avatar?.large || poster.avatar?.medium || poster.avatar?.small || '';
      // Time: prefer explicit timestamps, fall back to now
      const postedAt = post.published
        || post.createdAt
        || post.created
        || post.date
        || post.timePublished
        || post.metadata?.published
        || post.metadata?.timePublished
        || item.published
        || item.createdAt
        || item.created
        || item.date
        || new Date().toISOString();
      // Likes/comments
      const { likes, comments } = extractEngagement(item);

      // (Optional) Detail fetch for missing text
      if (ext.classif === 'missing') {
        // Placeholder: fetch more details for this post if needed
        // e.g., fetch full post by ID, log for review, etc.
        // You can implement a fetch here if the API supports it
        // console.log(`[detail-fetch] Could not extract text for post ${item.id}`);
      }

      postsToInsert.push({
        trader_id: traderId || null,
        etoro_username: poster_username,
        poster_id: poster_id,
        poster_first: poster_first,
        poster_last: poster_last,
        poster_avatar: poster_avatar,
        content: cleanText,
        posted_at: postedAt,
        likes: likes,
        comments: comments,
        mentioned_symbols: extractSymbols(cleanText),
        sentiment: analyzeSentiment(cleanText),
        source: 'etoro',
        etoro_post_id: item.id,
        _classif: ext.classif,
        _content_source: ext.source,
        _content_len: ext.len,
        raw_json: item
      });
    }
    console.log(`[summary] counts: ${JSON.stringify(summary)}`);

    // De-dupe by etoro_post_id (required for Postgres upsert DO UPDATE; duplicates in one statement can throw)
    const dedupeMap = new Map<string, any>();
    for (const p of postsToInsert) {
      if (!p?.etoro_post_id) continue;
      dedupeMap.set(String(p.etoro_post_id), p);
    }
    const dedupedPosts = Array.from(dedupeMap.values());
    const duplicatesRemoved = Math.max(0, postsToInsert.length - dedupedPosts.length);

    console.log(`Prepared ${postsToInsert.length} posts (${duplicatesRemoved} dupes removed => ${dedupedPosts.length} unique): ${trackedTraderPosts} from tracked traders, ${unknownTraderPosts} from unknown traders`);

    let insertedCount = 0;
    if (dryRun) {
      // Dry-run: do not write to DB, just return what would be inserted
      console.log(`[dry-run] Would process ${postsToInsert.length} posts, tracked=${trackedTraderPosts}, unknown=${unknownTraderPosts}`);
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          posts_scraped: discussions.length,
          posts_processed: postsToInsert.length,
          posts_from_tracked_traders: trackedTraderPosts,
          posts_from_unknown_traders: unknownTraderPosts,
          posts_to_insert: postsToInsert.slice(0, 10), // show sample
          posts_to_insert_count: postsToInsert.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (postsToInsert.length > 0) {
      // Upsert and update existing rows based on etoro_post_id so likes/comments/avatars stay fresh
      // Also handle common schema drift (e.g. raw_json column missing) by retrying without raw_json.
      let rawJsonDisabled = false;
      let rawJsonDisableReason: string | null = null;

      const tryUpsert = async (rows: any[]) => {
        return await supabase
          .from('posts')
          .upsert(rows, { onConflict: 'etoro_post_id' })
          .select();
      };

      let { data: inserted, error } = await tryUpsert(dedupedPosts);
      if (error) {
        const msg = (error as any)?.message || '';
        const details = (error as any)?.details || '';
        const hint = (error as any)?.hint || '';
        const combined = `${msg} ${details} ${hint}`.toLowerCase();

        // If raw_json isn't present in the DB schema, retry without it.
        if (combined.includes('raw_json') && (combined.includes('column') || combined.includes('does not exist'))) {
          rawJsonDisabled = true;
          rawJsonDisableReason = msg || details || 'raw_json missing';
          const stripped = dedupedPosts.map(({ raw_json, ...rest }) => rest);
          const retry = await tryUpsert(stripped);
          inserted = retry.data;
          error = retry.error;
        }
      }

      if (error) {
        console.error('Error upserting posts:', error);
        throw new Error((error as any)?.message || JSON.stringify(error) || 'Supabase upsert error');
      }

      insertedCount = inserted?.length || 0;
      console.log(`Successfully processed ${insertedCount} posts (raw_json_disabled=${rawJsonDisabled})`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        posts_scraped: discussions.length,
        posts_processed: dedupedPosts.length,
        posts_from_tracked_traders: trackedTraderPosts,
        posts_from_unknown_traders: unknownTraderPosts,
        posts_inserted: insertedCount,
        duplicates_removed: duplicatesRemoved,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    try {
      console.error('Error in scrape-posts (type):', typeof error, error);
      console.error('Error details (stringified):', JSON.stringify(error));
    } catch (e) {
      console.error('Error while logging scrape-posts error:', e);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        _debug_type: typeof error
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
