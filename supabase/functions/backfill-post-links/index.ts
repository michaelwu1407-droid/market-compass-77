import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type BackfillRequest = {
  limit?: number;
  dry_run?: boolean;
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

    // Fetch a batch of posts that are missing trader_id but have etoro_username.
    const { data: posts, error: postsErr } = await supabase
      .from("posts")
      .select("id, etoro_username")
      .is("trader_id", null)
      .not("etoro_username", "is", null)
      .order("posted_at", { ascending: false })
      .limit(limit);

    if (postsErr) throw postsErr;

    const usernames = Array.from(
      new Set(
        (posts ?? [])
          .map((p) => (p.etoro_username ?? "").trim().toLowerCase())
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

    // Load traders once and map username -> id (case-insensitive).
    const { data: traders, error: tradersErr } = await supabase
      .from("traders")
      .select("id, etoro_username")
      .not("etoro_username", "is", null);

    if (tradersErr) throw tradersErr;

    const traderMap = new Map<string, string>();
    for (const trader of traders ?? []) {
      const key = String(trader.etoro_username ?? "").trim().toLowerCase();
      if (key) traderMap.set(key, trader.id);
    }

    let updatedPosts = 0;
    const updatedUsernames: string[] = [];
    const skippedUsernames: string[] = [];

    for (const username of usernames) {
      const traderId = traderMap.get(username);
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
        .ilike("etoro_username", username)
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
