# Supabase Internal Cron Setup

- **Supabase project:** xgvaibxxiwfraklfbwey
- **Edge Function:** sync-worker
- **Scheduling:** Supabase **Scheduled Functions** (no external cron service)
- **Schedule config:** `supabase/cron.yaml` runs the function every 2 minutes (`*/2 * * * *`).
- No authentication headers are required for this function (`verify_jwt = false` for `sync-worker`).

## Payload
- Use `POST` with `Content-Type: application/json` and body `{}`.
- Some scheduled functions (notably `fetch-daily-prices`) run in batches to avoid Supabase Edge compute limits; you can override via `?max_assets=...`.

## Notes
- All scheduling is now internal to Supabase. No external cron or cloud scheduler is used.
- The function is public and does not require API keys or Authorization headers.
