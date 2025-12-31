import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { extractEtoroUsername, normalizeEtoroUsernameKey } from "../_shared/etoroUsername.ts";

type BackfillRequest = {
  limit?: number;
  dry_run?: boolean;
  create_missing_traders?: boolean;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json().catch(() => ({}))) as BackfillRequest;
    const limit = Math.max(1, Math.min(2000, Number(body.limit ?? 500)));
    const dryRun = Boolean(body.dry_run);
    const createMissingTraders = Boolean(body.create_missing_traders);

    // Fetch a batch of posts that are missing trader_id but have etoro_username.
    const { data: posts, error: postsErr } = await supabase
      .from("posts")
      .select("id, etoro_username")
      .is("trader_id", null)
      .not("etoro_username", "is", null)
      .order("posted_at", { ascending: false })
      .limit(limit);

    if (postsErr) throw postsErr;

    const usernames: string[] = Array.from(
      new Set<string>(
        (posts ?? [])
          .map((p) => normalizeEtoroUsernameKey(p.etoro_username))
          .filter(Boolean),
      ),
    );

    if (usernames.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          scanned_posts: posts?.length ?? 0,
          unique_usernames: 0,
          updated_posts: 0,
          dry_run: dryRun,
          message: "No posts found that require backfill.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let updatedPosts = 0;
    const updatedUsernames: string[] = [];
    const skippedUsernames: string[] = [];
    const createdTraders: string[] = [];

    const resolveTraderId = async (usernameKey: string): Promise<string | null> => {
      if (!usernameKey) return null;

      // Exact case-insensitive match.
      const { data, error } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .ilike('etoro_username', usernameKey)
        .limit(1);
      if (error) throw error;
      const first = data?.[0] as any;
      if (first?.id) return String(first.id);

      // Sometimes usernames are stored with a leading '@'
      const { data: dataAt, error: errAt } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .ilike('etoro_username', `@${usernameKey}`)
        .limit(1);
      if (errAt) throw errAt;
      const firstAt = dataAt?.[0] as any;
      if (firstAt?.id) return String(firstAt.id);

      return null;
    };

    for (const username of usernames) {
      let traderId = await resolveTraderId(username);
      if (!traderId && createMissingTraders && !dryRun) {
        const extracted = extractEtoroUsername(username);
        if (extracted) {
          const { data: created, error: createErr } = await supabase
            .from('traders')
            .upsert({ etoro_username: extracted, display_name: extracted }, { onConflict: 'etoro_username' })
            .select('id')
            .single();
          if (createErr) throw createErr;
          traderId = created?.id ?? null;
          if (traderId) createdTraders.push(extracted);
        }
      }

      if (!traderId) {
        skippedUsernames.push(username);
        continue;
      }

      if (dryRun) {
        updatedUsernames.push(username);
        continue;
      }

      const { data: updated, error: updateErr } = await supabase
        .from("posts")
        .update({ trader_id: traderId })
        .is("trader_id", null)
        .or(`etoro_username.ilike.${username},etoro_username.ilike.@${username}`)
        .select("id");

      if (updateErr) throw updateErr;

      updatedPosts += updated?.length ?? 0;
      updatedUsernames.push(username);
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned_posts: posts?.length ?? 0,
        unique_usernames: usernames.length,
        updated_posts: updatedPosts,
        updated_usernames: updatedUsernames,
        skipped_usernames: skippedUsernames,
        created_traders: createdTraders,
        dry_run: dryRun,
        limit,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[backfill-post-links] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
