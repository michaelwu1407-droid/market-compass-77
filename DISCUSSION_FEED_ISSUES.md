# Discussion feed issues

Date range: Dec 2025 (culminated on Dec 28, 2025)

## Executive summary
The Discussion Feed “looked broken” in multiple ways over time:
1) posts rendered but author + engagement were missing, 2) Admin Sync “Sync now” didn’t trigger the right pipeline, and later 3) the feed became empty due to a PostgREST schema mismatch (HTTP 400 / error 42703).

The final, user-visible outcome is that the feed loads again, shows authors/avatars, and engagement counts (likes/comments) are correctly populated from eToro.

## Primary symptoms observed
- Feed cards displayed post content, but:
  - author name and avatar were missing
  - likes/comments were missing or always 0
- “Sync now” on Admin Sync page did not refresh discussion feed.
- At a later stage, feed went fully empty.
  - Browser Network showed `/rest/v1/posts?...select=...` returning `400 Bad Request` with PostgREST error `42703` (undefined column).

## Root causes (what actually broke)
### 1) Ingestion was not extracting/storing the right fields
- The scraping/ingestion Edge Function wasn’t extracting author and engagement from the correct eToro payload paths.
- Engagement counts must come from:
  - likes: `emotionsData.like.paging.totalCount`
  - comments: `summary.totalCommentsAndReplies`
  (not `reactionsCount` / `commentsCount`)

### 2) Backfill was blocked by missing source JSON
- Backfill/repair required the original event payload, but we were not reliably storing `raw_json`.
- Without `raw_json`, we can’t reconstruct missing fields after the fact.

### 3) Operational jobs were failing due to auth and timeouts
- The “fix posts” backfill function initially timed out when trying to process too much in one run.
- Some function runs returned 401 due to JWT verification being enabled.
- Fix required batching + setting `verify_jwt=false` for operational/admin-triggered functions.

### 4) Deployment workflow gap (changes not reaching production)
- Updated Edge Functions weren’t being deployed because the workflow and local deploy script didn’t include the relevant functions initially.

### 5) Feed empty due to schema mismatch in frontend select
- The frontend posts query selected columns that did not exist in the production `posts` table.
- Concrete error reproduced:
  - `code: "42703"`
  - `message: "column posts.like_count does not exist"`
- PostgREST fails the entire query when any selected column is invalid, so the feed query returned 400 and no posts rendered.

### 6) RLS blocked joined trader data for anon
- A migration changed `traders` SELECT policy to authenticated-only, which broke anon feed joins.
- Restored a public SELECT policy for `traders`.

## What we tried along the way
- Verified “posts exist” independently via a minimal REST query selecting only known columns.
- Compared frontend `.select(...)` lists against actual DB schema (migrations + PostgREST errors).
- Used Edge Function logs to verify that sync runs were actually inserting posts.
- Validated correct eToro payload paths for engagement counts.

## What we changed (final fixes)
### Frontend
- Stop selecting non-existent columns `like_count` and `comment_count` from `posts`.
- Compute UI `like_count/comment_count` from DB columns `likes/comments`.

Key patches:
- `src/hooks/usePosts.ts`
  - removed `like_count, comment_count` from `.select(...)`
- `src/pages/FeedPage.tsx`
  - changed mapping to `like_count: post.likes ?? 0` and `comment_count: post.comments ?? 0`
- `src/components/feed/FeedCard.tsx`
  - prefer UI `like_count/comment_count`, fallback to `likes/comments`

### Backend / Edge Functions
- Enhanced `scrape-posts` to:
  - extract author/avatar/timestamps robustly
  - extract engagement via the correct payload paths
  - store `raw_json` when available
- Enhanced `fix-posts` to:
  - run in batches (limit/offset)
  - avoid overwriting already-good values
- Enabled `verify_jwt=false` for operational functions so Admin Sync can run them.
- Updated deployment workflow/scripts to ensure updated functions are actually deployed.

### Database / RLS
- Restored anon SELECT access for `traders` so the feed join works for unauthenticated users.

## Verification / acceptance checks
- Frontend build succeeded (`npm run build`).
- The previously failing request no longer includes `like_count/comment_count`, preventing PostgREST `42703` failures.
- Triggered discussion-feed sync; logs showed successful insertions (e.g., “Completed: 100 posts inserted”).
- Feed displays:
  - author name/avatar
  - likes/comments

## Learnings (next time)
- Treat PostgREST `42703` as “bad select list”: one invalid column breaks the whole query.
- Keep frontend selects aligned to migrations; avoid selecting speculative/legacy fields.
  - If we need aliases, implement a DB view (or update schema) instead of selecting non-existent columns.
- Always store source payload (`raw_json`) for ingest pipelines so backfills are possible.
- For maintenance/backfill functions:
  - design for batching from day one
  - make them idempotent and “fill-only” by default
- Deployment hygiene:
  - keep an explicit list of functions to deploy (workflow + local script)
  - add a quick post-deploy verification step (invoke a function and check for expected log markers)
- RLS hygiene:
  - any change to `traders`/join tables can silently break public pages; add a regression check that anon can read required tables.

## References
- Logs guidance: CHECK_LOGS.md
- Sync pipeline context: SYNC_PIPELINE_FIX_SUMMARY.md
