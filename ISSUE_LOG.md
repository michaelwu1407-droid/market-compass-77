# Issue Log (for Jules)

Date: 2025-12-30

Scope: Frontend navigation/prefill flows (Feed → Trader, Feed → Analysis), Daily page data pipeline, and Copy Traders data completeness (metrics/stats/activity/posts) with minimal manual intervention.

Confirmed requirements:
- Feed: “View trader” routes to the internal Copy Traders profile (not external eToro).
- Feed: “Analyse” routes to Analysis prefilled for Trader Portfolio when a trader is present.
- Daily: today-only (do not fall back to yesterday).

---

## FEED-1 — Feed “View trader” routes to internal trader profile

### Problem
Clicking “View trader” on Discussion Feed should always route to the internal trader profile page under Copy Traders.

### Expected behavior
- Clicking “View trader” navigates to `/traders/:traderId`.
- The destination profile loads without triggering the global ErrorBoundary.

### Current behavior observed
- Some feed items do not route correctly (missing trader id context).
- Historically, even when routing succeeded, some profiles crashed due to null fields (partial fixes exist).

### Context (code)
- Navigation is done in the component button handler:
  - src/components/feed/FeedCard.tsx (handleViewTrader → `navigate(`/traders/${traderId}`)`)
- Feed items are mapped from posts:
  - src/pages/FeedPage.tsx (construction of `mappedTrader` from `post.traders` join)

### Likely root causes
- `post.trader` (joined object) is optional; if the `traders` join isn’t present, the UI may still show a trader name/username but lacks a reliable UUID.
- Some trader profiles still contain nulls that can crash charts/formatters when opened.

### What we already tried
- Added global ErrorBoundary to prevent full blank screens.
- Hardened multiple trader display name / return formatting crash paths.
- Added targeted refresh mode in backend sync worker for single trader refresh.

### Fix plan (what Jules should implement)
1. Make Feed’s “View trader” use the most reliable identifier available:
   - Prefer `post.trader_id` (UUID) when present.
   - Else, if only `etoro_username` exists, resolve UUID by querying `traders` by `etoro_username` (requires unique index / reliable mapping).
2. If no UUID can be resolved, show a toast (“Trader not available yet”) and do not navigate.

### Definition of Done / How to know it’s fixed
- From Feed, click “View trader” on at least 20 posts across different traders:
  - 100% navigate to a valid `/traders/<uuid>` OR show a clear “Trader not available yet” toast (no crash).
  - No ErrorBoundary screen.

### Verification steps
- Manual: browse Feed → click “View trader” repeatedly.
- Data: confirm `posts.trader_id` is populated (or username→UUID lookup works reliably).

---

## FEED-2 — Feed “Analyse” pre-fills Analysis for Trader Portfolio

### Problem
Clicking “Analyse” in the Feed should open the Analysis page with:
- Report type toggled to Trader Portfolio
- Trader already selected (pre-filled)

### Expected behavior
- Feed Post/Trade about a trader → Analysis page opens prefilled for that trader.
- If no trader context exists, fall back to normal analysis.

### Current behavior (code)
- FeedCard calls `onAnalyse?.(item)`.
- FeedPage defines `handleAnalyse = () => navigate('/analysis')` and passes it into FeedCard.
- AnalysisPage supports `?trader=` query param and uses it to preselect a trader.

### Likely root causes
- Handler signature mismatch: FeedCard supplies `(item)` but FeedPage ignores it.
- There’s no query param / state to force report type (Trader Portfolio) in AnalysisInput.

### What we already tried
- TradersPage already deep-links to analysis with `?trader=<id>`.

### Fix plan (what Jules should implement)
1. Update FeedPage handler to accept `item: FeedItem`.
2. For posts/trades with trader id available:
   - navigate to `/analysis?trader=<uuid>&mode=trader_portfolio`
3. Update AnalysisPage/AnalysisInput to read `mode=trader_portfolio` and default the report type toggle accordingly.

### Definition of Done / How to know it’s fixed
- Clicking Feed “Analyse” on a post with a trader:
  - opens Analysis
  - report type is already Trader Portfolio
  - trader is already selected
- Refreshing the analysis page URL preserves that state.

### Verification steps
- Manual: click Analyse from Feed on multiple items.
- URL: confirm query params drive UI state.

---

## DAILY-1 — Daily page stuck showing “Loading daily movers…”

### Problem
Top summary text keeps saying “Loading daily movers…” and the page shows no daily trader/mover data.

### Confirmed requirement
- Today-only (do not fall back to yesterday).

### Current behavior (code)
- Summary uses a fallback string when there is no top gainer:
  - src/pages/DailyPage.tsx (topGainerText uses `'Loading daily movers...'` when `topGainer` is null)

### Likely root causes
- Data is empty because ingestion/sync isn’t running, but UI shows “Loading” instead of “No data”.

### Fix plan (what Jules should implement)
1. Make hero summary text reflect loading vs empty:
   - If `moversLoading` is true → “Loading…”
   - Else if data length is 0 → “No daily movers available today”
   - Else show top gainer
2. Keep today-only: do not backfill yesterday.

### Definition of Done
- When `moversLoading=false` and there are 0 movers for today, UI shows “No daily movers available today” (not “Loading…”).

### Verification
- Manual: open Daily page when table is empty; confirm messaging.

---

## DAILY-2 — No daily movers and no recent trader moves

### Problem
Daily Movers and Recent Trader Moves are empty.

### Context
- Daily movers come from `useTodayMovers()`.
- Trades come from `useRecentTrades(10)`.

### Likely root causes
- No rows in the underlying tables (daily movers and/or trades).
- Scheduled sync isn’t running frequently.

### Fix plan (what Jules should implement)
1. Identify exact tables queried by the hooks:
   - src/hooks/useDailyMovers.ts (today movers)
   - src/hooks/useTrades.ts (recent trades)
2. Ensure edge functions write rows into those tables.
3. Schedule those functions (Supabase cron or external cron) to run frequently.

### Definition of Done
- On a normal market day, Daily Movers list contains rows for today.
- Recent Trader Moves list contains rows after at least one trader sync.

### Verification
- DB: query counts for today’s movers and recent trades.
- UI: confirm both sections display non-empty states.

---

## TRADERS-1 — Copy Traders missing key metrics (24M, AUM, 1M, YTD, 5Y, profitability)

### Problem
Copy Traders is the core page but many metrics are missing or show as zeros.

### Expected behavior
- If data exists, display it.
- If data does not exist, show `-` (not `0`), to avoid false precision.

### Likely root causes
- Ingestion does not populate these fields (or doesn’t refresh them).
- Some mapping layers coerce null→0.

### What we already tried
- Multiple UI fixes to avoid “null becomes 0%” in several components, but not everywhere.
- Expanded backend ingestion via BullAware + targeted refresh.

### Fix plan (what Jules should implement)
1. Define the “factsheet parity” metric list (exact fields required).
2. Ensure DB schema has columns/tables for those fields.
3. Update sync pipeline to populate them.
4. Remove null→0 coercion in UI formatting for these metrics.

### Definition of Done
- For a known trader with rich data:
  - 24M return, AUM, 1M, YTD, 5Y, profitability metrics display correctly.
- For a trader without data:
  - UI shows `-` and does not show `0` unless the real value is zero.

---

## TRADERS-2 — Stats page missing segments from BullAware factsheet

### Problem
Stats page does not show many segments present in the BullAware factsheet.

### Likely root causes
- Missing ingestion for those fields.
- UI not rendering them.

---

## PRICING-1 — Remaining Yahoo symbol mismatch: NVTKL.L

### Status
TODO (non-blocking)

### Current behavior
- Daily pricing pipeline now updates most assets via Yahoo v8 chart.
- One remaining failing symbol observed: `NVTKL.L`.

### Likely root cause
- Symbol does not exist on Yahoo as-is, or requires an alternate ticker / exchange suffix.

### Next steps
- Identify the correct Yahoo ticker for this asset and add a mapping/alias rule.

### Fix plan
- Same as TRADERS-1, but ensure each factsheet segment has:
  - schema
  - ingestion
  - UI render

### Definition of Done
- Stats page matches the agreed factsheet parity checklist.

---

## TRADERS-3 — Activity tab blank

### Problem
Activity page shows no trades.

### Likely root causes
- Trades not ingested.
- Trades not linked to `trader_id`.
- UI queries a table/view that isn’t populated.

### Fix plan
1. Verify ingestion writes trades with correct `trader_id`.
2. Verify UI query matches that table.
3. Ensure scheduled sync keeps it fresh.

### Definition of Done
- For a trader known to have trades:
  - Activity tab shows rows.

---

## TRADERS-4 — Posts tab blank

### Problem
Posts tab shows no posts for a trader.

### Likely root causes
- Posts do exist (Feed shows them) but are not linked correctly by `trader_id`.
- Posts query filters differ between Feed and Trader posts tab.

### Fix plan
1. Ensure posts have `trader_id` consistently.
2. Make trader posts query use the same linking strategy as feed mapping.

### Definition of Done
- If a trader has posts in the system, Posts tab shows them.

---

## TRADERS-5 — Reduce manual intervention (automatic frequent syncing)

### Problem
Data freshness requires manual refresh / manual invocation.

### Expected behavior
- Automated jobs continuously refresh:
  - traders (profiles + metrics)
  - trades
  - posts
  - daily movers
  - histories (monthly/equity/portfolio)

### What we already tried
- Added targeted refresh via `sync-worker` for single-trader refresh.
- Added a probe function for eToro endpoint discovery.

### Fix plan
1. Confirm cron is configured and enabled for the deployed environment.
2. If Supabase cron is not available, configure an external cron fallback.
3. Add basic health/visibility:
   - last-run timestamps
   - error logging

### Definition of Done
- Without clicking refresh:
  - new feed posts appear over time
  - daily movers populate for today (when available)
  - trader profiles update (timestamps advance)

---

## Notes / known previous crash class (important)

We previously found and fixed multiple runtime crashes caused by null fields and invalid dates. Remaining work should assume:
- Any `.toFixed()`, `format(new Date(...))`, `formatDistanceToNow(new Date(...))`, and string indexing `[0]` must be guarded.
- Missing numeric values should not be coerced to 0 unless 0 is a real value.
