/// <reference path="../edge-runtime.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractEtoroUsername, normalizeEtoroUsernameKey } from "../_shared/etoroUsername.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeUsername(raw: unknown): string {
  return normalizeEtoroUsernameKey(raw);
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
  for (const word of bullishWords) { if (lowerText.includes(word)) bullScore++; }
  for (const word of bearishWords) { if (lowerText.includes(word)) bearScore++; }
  if (bullScore > bearScore) return 'bullish';
  if (bearScore > bullScore) return 'bearish';
  return 'neutral';
}

function firstNumber(candidates: any[]): number {
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > 0 && /^-?\d+(\.\d+)?$/.test(trimmed)) {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) return parsed;
      }
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
  const emotionsData = item?.emotionsData || post?.emotionsData || metadata?.emotionsData || {};
  const likeEmotions = emotionsData?.like || emotionsData?.Like || {};
  const likePaging = likeEmotions?.paging || likeEmotions?.reactionPaging || {};
  const commentsData = item?.commentsData || post?.commentsData || {};
  const summary = item?.summary || post?.summary || {};

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
    likePaging?.totalCount,
    likePaging?.count,
    likeEmotions?.totalCount,
    commentsData?.reactionPaging?.totalCount,
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
    summary?.totalCommentsAndReplies,
    summary?.totalComments,
    summary?.commentsCount,
    commentsData?.commentsCount,
  ]);

  return {
    likes: Math.max(0, likes),
    comments: Math.max(0, comments),
  };
}

function isLikelyId(s: string) {
  if (!s) return false;
  const trimmed = s.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return true;
  if (/^[0-9a-f\-]{20,}$/i.test(trimmed) && !/\s/.test(trimmed)) return true;
  const hexRatio = (trimmed.replace(/[^0-9a-f]/gi, '').length / Math.max(1, trimmed.length));
  if (trimmed.length > 20 && hexRatio > 0.7) return true;
  return false;
}

function extractReadableText(post: any) {
  let candidates = [];
  // 1) post.message.text
  if (typeof post?.message?.text === 'string') candidates.push({text: post.message.text, source: 'post.message.text'});
  // 2) post.text
  if (typeof post?.text === 'string') candidates.push({text: post.text, source: 'post.text'});
  // 3) post.content
  if (typeof post?.content === 'string') candidates.push({text: post.content, source: 'post.content'});
  // 4) post.body
  if (typeof post?.body === 'string') candidates.push({text: post.body, source: 'post.body'});
  // 5) post.summary
  if (typeof post?.summary === 'string') candidates.push({text: post.summary, source: 'post.summary'});
  // 6) post.description
  if (typeof post?.description === 'string') candidates.push({text: post.description, source: 'post.description'});
  // 7) post.html
  if (typeof post?.html === 'string') candidates.push({text: post.html, source: 'post.html'});
  // 8) post.rendered
  if (typeof post?.rendered === 'string') candidates.push({text: post.rendered, source: 'post.rendered'});
  // 9) post.renderedHtml
  if (typeof post?.renderedHtml === 'string') candidates.push({text: post.renderedHtml, source: 'post.renderedHtml'});
  // 10) post.post_text
  if (typeof post?.post_text === 'string') candidates.push({text: post.post_text, source: 'post.post_text'});
  // Fallback: any string field in post
  for (const k of Object.keys(post)) {
    const v = post[k];
    if (typeof v === 'string') candidates.push({text: v, source: `post.${k}`} );
  }
  for (const c of candidates) {
    const t = c.text?.trim() || '';
    if (!t) continue;
    if (isLikelyId(t)) return {text: t, source: c.source, len: t.length, classif: 'guid_like'};
    if (t.length >= 40) return {text: t, source: c.source, len: t.length, classif: 'readable'};
    if (t.length > 0) return {text: t, source: c.source, len: t.length, classif: 'short'};
  }
  return {text: null, source: '', len: 0, classif: 'missing'};
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || '200')));
    const offset = Math.max(0, Number(url.searchParams.get('offset') || '0'));
    const onlyMissingTraderId = (url.searchParams.get('only_missing_trader_id') || '').toLowerCase() === 'true'
      || (url.searchParams.get('mode') || '').toLowerCase() === 'backfill_links';

    // Fetch a single batch of posts to avoid timeouts.
    let query = supabase
      .from('posts')
      .select('*');

    if (onlyMissingTraderId) {
      query = query
        .is('trader_id', null)
        .not('etoro_username', 'is', null)
        .order('posted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    } else {
      query = query
        .order('created_at', { ascending: true });
    }

    const { data: posts, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, processed: 0, offset, limit, done: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build a username -> trader_id map for backfilling posts.trader_id.
    // PostgREST responses are capped (commonly 1000 rows) unless we page with range().
    const traderIdByUsername = new Map<string, string>();

    const needsTraderLookup = (posts ?? []).some((p: any) => !p?.trader_id && p?.etoro_username);
    if (needsTraderLookup) {
      const tradersPageSize = 1000;
      for (let tradersOffset = 0; tradersOffset < 20000; tradersOffset += tradersPageSize) {
        const { data: tradersPage, error: tradersErr } = await supabase
          .from('traders')
          .select('id, etoro_username')
          .not('etoro_username', 'is', null)
          .range(tradersOffset, tradersOffset + tradersPageSize - 1);
        if (tradersErr) throw tradersErr;

        const page = tradersPage ?? [];
        for (const t of page) {
          const key = normalizeUsername((t as any)?.etoro_username);
          if (!key) continue;
          traderIdByUsername.set(key, (t as any).id);
        }

        if (page.length < tradersPageSize) break;
      }
    }

    const updates: any[] = [];
    let backfilledTraderId = 0;
    for (const row of posts) {
      // Use raw_json if available, else fallback to content
      let postObj: any = {};
      try {
        if (row.raw_json && typeof row.raw_json === 'object') {
          postObj = row.raw_json;
        } else if (typeof row.content === 'string') {
          postObj = { content: row.content };
        }
      } catch {}

      // Extract readable text and metadata
      const ext = extractReadableText(postObj);
      let cleanText = (ext.text || '').replace(/\r\n|\r/g, '\n').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
      cleanText = cleanText.replace(/\n{3,}/g, '\n\n');

      // Poster info: prefer existing DB values; only fill gaps from raw JSON.
      const owner = postObj?.post?.owner || {};
      let poster_username = row.etoro_username || owner?.username || 'unknown';
      // Normalize the stored username so linking is consistent (strip leading @, urls, trim).
      const normalizedUsernameForStore = extractEtoroUsername(poster_username);
      poster_username = normalizedUsernameForStore || poster_username;
      let poster_id = row.poster_id || owner?.id || null;
      let poster_first = row.poster_first
        || owner?.firstName
        || owner?.first_name
        || owner?.firstname
        || poster_username
        || '';
      let poster_last = row.poster_last
        || owner?.lastName
        || owner?.last_name
        || owner?.lastname
        || '';
      let poster_avatar = row.poster_avatar
        || owner?.avatar?.large
        || owner?.avatar?.medium
        || owner?.avatar?.small
        || owner?.avatarUrl
        || owner?.pictureUrl
        || owner?.imageUrl
        || '';

      // Time
      let postedAt = row.posted_at
        || postObj?.post?.published
        || postObj?.post?.createdAt
        || postObj?.post?.created
        || postObj?.post?.date
        || postObj?.post?.timePublished
        || postObj?.published
        || postObj?.createdAt
        || postObj?.created
        || postObj?.date
        || row.created_at
        || new Date().toISOString();

      const engagement = extractEngagement(postObj);

      // Likes/comments: keep existing non-zero values, otherwise fill from engagement.
      let likes = (typeof row.likes === 'number' && row.likes > 0) ? row.likes : engagement.likes;
      let comments = (typeof row.comments === 'number' && row.comments > 0) ? row.comments : engagement.comments;

      const mentioned_symbols = extractSymbols(cleanText);
      const sentiment = analyzeSentiment(cleanText);

      // Backfill trader_id if missing and we can resolve from username.
      const usernameKey = normalizeUsername(poster_username);
      const resolvedTraderId = (!row.trader_id && usernameKey)
        ? (traderIdByUsername.get(usernameKey) ?? null)
        : null;


      const update: any = {
        id: row.id,
        content: cleanText,
        _classif: ext.classif,
        _content_source: ext.source,
        _content_len: ext.len,
        etoro_username: poster_username,
        poster_id: poster_id,
        poster_first: poster_first,
        poster_last: poster_last,
        poster_avatar: poster_avatar,
        posted_at: postedAt,
        likes: likes,
        comments: comments,
        mentioned_symbols,
        sentiment,
      };

      if (resolvedTraderId) {
        update.trader_id = resolvedTraderId;
        backfilledTraderId++;
      }

      updates.push(update);
    }

    const { error: upsertError } = await supabase
      .from('posts')
      .upsert(updates, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    const nextOffset = offset + posts.length;
    const done = posts.length < limit;
    return new Response(
      JSON.stringify({
        success: true,
        processed: posts.length,
        updated: updates.length,
        backfilled_trader_id: backfilledTraderId,
        offset,
        limit,
        next_offset: nextOffset,
        done,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error)?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
