# TODO Log

This file records follow-up tasks discussed during development, with timestamps.

## 2025-12-29
- [ ] Tune the `enqueue-sync-jobs` eToro profile stale window (e.g. 24h vs 7d) for `etoro_profile` job creation.
- [ ] Remove or disable the `debug` payload output in `enqueue-sync-jobs` so production responses stay minimal.

## 2025-12-28
- [x] Add targeted `trader_id` refresh path to `sync-worker` so TraderDetail refresh updates immediately.
- [x] Add BullAware `trades` ingestion path in `sync-trader-details` to populate `trades` table.
- [x] Add `probe-etoro` Edge Function to test eToro endpoints for usable time-series payloads.
- [ ] Implement BullAware ingestion for `trader_performance`, `trader_equity_history`, and `trader_portfolio_history`.
- [ ] Consider limiting BullAware job enqueuing (avoid creating 4x jobs for all traders at once).
