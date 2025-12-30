# Issue Log (for Jules)

Date: 2025-12-30

Scope: Frontend navigation/prefill flows (Feed → Trader, Feed → Analysis), Daily page data pipeline, and Copy Traders data completeness (metrics/stats/activity/posts) with minimal manual intervention.

Confirmed requirements:
- Feed: “View trader” routes to the internal Copy Traders profile (not external eToro).
- Feed: “Analyse” routes to Analysis prefilled for Trader Portfolio when a trader is present.
- Daily: today-only (do not fall back to yesterday).

---

## OPS-1 — Deploy workflow missing required functions

Status: Implemented (2025-12-31)

### Problem
Production behavior can look “broken” even when code is correct if GitHub Actions deploy does not deploy the Edge Functions that power Daily + asset backfills + diagnostics.

### Fix
- Updated `.github/workflows/deploy.yml` to deploy required functions used by cron + validation:
  - `fetch-daily-prices`, `fetch-market-movers`, `scrape-daily-movers`
  - `enrich-assets-yahoo`, `backfill-asset-history`, `backfill-post-links`
  - `inspect-db`

### Definition of Done
- After push to `main`, the GitHub Actions deploy run is green and the above functions return 200 at `/functions/v1/<name>`.

---

## OPS-2 — External cron calls failing due to JWT requirements

Status: Implemented (2025-12-31)

### Problem
External cron services typically call functions without auth headers; if a function is not public (`verify_jwt = true`), cron will fail with 401.

### Fix
- Updated `supabase/config.toml` to ensure scheduled/validation functions are public (`verify_jwt = false`), including:
  - `fetch-daily-prices`, `fetch-market-movers`, `scrape-daily-movers`
  - `enrich-assets-yahoo`, `backfill-asset-history`, `backfill-post-links`
  - `check-system-health`, `inspect-db`, `verify-deployment`

### Definition of Done
- Cron endpoints return 200 without Authorization headers (when invoked from external cron).


---

## FEED-1 — Feed “View trader” routes to internal trader profile

Status: Implemented (2025-12-31)

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

### Implementation notes
- Feed now passes `etoro_username` into the mapped post object so click handlers can resolve UUID even when `trader_id` is missing.
- Feed uses username→UUID resolution via `traders.etoro_username` and only navigates when a UUID is resolved.

### Verification steps
- Manual: browse Feed → click “View trader” repeatedly.
- Data: confirm `posts.trader_id` is populated (or username→UUID lookup works reliably).

---

## FEED-2 — Feed “Analyse” pre-fills Analysis for Trader Portfolio

Status: Implemented (2025-12-31)

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

### Implementation notes
- Feed “Analyse” now navigates to `/analysis?trader=<uuid>&mode=trader_portfolio` when a trader can be resolved.
- Analysis reads `mode=trader_portfolio` and defaults the report type accordingly.

### Verification steps
- Manual: click Analyse from Feed on multiple items.
- URL: confirm query params drive UI state.

---

## DAILY-1 — Daily page stuck showing “Loading daily movers…”

Status: Implemented (2025-12-31)

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

### Implementation notes
- Daily hero summary now distinguishes loading vs empty vs populated states.

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

## TRADER-0 — Acceptance criteria (non-negotiable)

These are requirements for trader profiles and related asset/portfolio views.

- Blank values are not acceptable for key factsheet/profile fields; if a value is unknown, the UI must show a clear reason and/or the backend must backfill.
- “Unknown/Other” classifications must not dominate (target: <20%), otherwise breakdown must be improved (more granular sectors/categories).
- Autosync must be visible (timestamps), so it’s obvious that refreshes are happening without manual intervention.

---

## TRADER-1 — Trader profile factsheet parity (BullAware-style)

Status: Partially implemented (2025-12-31)

### Problem
Trader profile pages are missing multiple factsheet datapoints and visualizations expected for a production-grade copy-trader profile.

### Expected behavior
- Overview includes: AUM, copiers, risk score, returns (1M/YTD/1Y/5Y), track record, and a clear last-synced indicator.
- Factsheet section includes monthly returns, annualized returns, drawdowns, and key performance metrics with minimal duplication.

### Implementation notes
- Trader page now renders 1M / YTD / 5Y return fields directly from `traders.return_1m`, `traders.return_ytd`, `traders.return_5y` (when present), and shows “Not synced” instead of a blank dash.
- Trader page shows “Last synced …” from `traders.details_synced_at` (fallback `updated_at`).

### Still missing (pipeline/data dependent)
- Full factsheet parity (track record section, annualized returns breakdown, and tighter layout parity).

### Notes
- Some returns columns exist in DB (e.g., return_1m/return_ytd/return_5y) but must be populated and displayed.

---

## TRADER-2 — Posts tab empty (posts not linked to trader)

Status: Implemented (2025-12-31)

### Problem
Posts can exist in the DB but the Trader profile Posts tab can be empty because posts are not always linked via posts.trader_id.

### Expected behavior
- Posts tab shows posts for that trader consistently.
- If trader_id linkage is missing, fallback to username-based matching and/or backfill posts.trader_id.

### Work started

### Implementation notes
- Frontend falls back to username matching when `posts.trader_id` is missing.
- Added scheduled backfill job: `backfill-post-links` links `posts.trader_id` from `posts.etoro_username`.

---

## TRADER-3 — Activity tab empty / incomplete

Status: Improved UX + still data-dependent (2025-12-31)

### Problem
Activity (closed trades) can be empty even when the trader has known activity.

### Expected behavior
- Activity shows recent closed trades (and/or other activity types if supported) reliably.
- If the DB doesn’t store trades for a trader, the sync pipeline must backfill.

### Implementation notes
- Activity tab now has a clear empty-state message prompting refresh when no trades are present.

### Still missing (pipeline/data dependent)
- Some traders may legitimately have no trades ingested yet (provider coverage/rate-limits). This requires continued improvements to the sync pipeline and/or additional eToro endpoints.

---

## TRADER-4 — Portfolio holdings completeness (sector, P/L, avg price)

Status: Improved UX + still data-dependent (2025-12-31)

### Problem
Holdings tables can show missing sector, missing P/L, and missing average price/cost basis.

### Expected behavior
- Holdings list includes sector, allocation, average price, and P/L (or a clear reason why unavailable).

### Implementation notes
- Holdings now shows explicit placeholders (e.g., “Unknown (enriching…)”, “Not synced”) instead of bare dashes.

---

## TRADER-5 — Allocation top-5 table and category breakdown

### Problem
Allocation breakdown can be too coarse ("Other" heavy) and missing a clear top-5 breakdown.

### Expected behavior
- Show top-5 holdings table alongside allocation charts.
- Sector/category mapping should reduce Unknown/Other over time.

---

## TRADER-6 — Reduce duplicate metrics in Stats tab

### Problem
Stats page has duplicated metrics and isn’t aligned to a single authoritative factsheet layout.

### Expected behavior
- Consolidate metrics display so each metric appears once in the appropriate section.

---

## TRADER-7 — Prefer eToro endpoints where BullAware is limited

### Problem
BullAware has rate limits/coverage gaps, leading to incomplete trader profiles.

### Expected behavior
- Explore and integrate additional eToro endpoints to fill gaps where possible.
- Ensure ingestion remains stable and rate-limit aware.

---

## TRADER-8 — Autosync visibility on trader pages

### Problem
Users cannot easily tell whether a trader is being refreshed automatically.

### Expected behavior
- Trader page shows “Last synced …” and updates after background sync runs.

---

## ASSET-1 — Asset page timestamps and freshness

### Problem
Asset pages do not clearly show whether fundamentals/sector/price history were recently refreshed.

### Expected behavior
- Show clear “Last updated” / “Last price history sync” timestamps.

---

## ASSET-2 — Price chart ranges (5Y/All) axis/ticks correctness

Status: Implemented (2025-12-31)

### Problem
Chart range selection can appear to not change axes/ticks appropriately.

### Expected behavior
- Range changes adjust domain and tick strategy appropriately, especially for 5Y and All.

### Implementation notes
- PriceChart now computes tick interval based on selected range + number of points, making 5Y/All visibly change the x-axis density.

---

## ASSET-3 — Highlights correctness (beta/metrics blanks or wrong)

### Problem
Highlights section can be blank or show incorrect values.

### Expected behavior
- Highlights show populated, consistent fundamentals where available; missing values must be clearly handled.

---

## ASSET-4 — News fetch reliability

Status: Implemented (2025-12-31)

### Problem
“Recent news failed to fetch” appears too often.

### Expected behavior
- News fetch succeeds reliably or degrades gracefully with a clear explanation.

### Implementation notes
- StockNews now tries multiple fetch strategies/proxies before showing an error.

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

### Implementation notes
- Added `supabase/cron.yaml` schedules for core background automation:
  - `sync-worker` (every 2 min)
  - `enrich-assets-yahoo` (every 15 min)
  - `backfill-asset-history` (staggered every 15 min)
  - `backfill-post-links` (every 10 min)
  - `fetch-daily-prices` (daily, default 20:10 UTC)
  - `scrape-daily-movers` (daily, default 20:30 UTC)
- Updated external-cron fallback docs:
  - `SETUP_EXTERNAL_CRON.md`
  - `WORKAROUND_NO_CRON.md`

### Verification
- Run `scripts/smoke-validate.ps1` twice ~10 minutes apart and confirm:
  - `sync_jobs completed (last N min)` increases
  - `assets updated in last N min` increases after scheduled jobs
  - `daily_movers` has rows on market days after daily jobs run
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
