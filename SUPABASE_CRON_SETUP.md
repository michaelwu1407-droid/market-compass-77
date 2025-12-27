# Supabase Internal Cron Setup

- **Supabase project:** xgvaibxxiwfraklfbwey
- **Edge Function:** sync-worker
- **Scheduling:** Handled by Supabase `pg_cron` (no external cron service)
- **Cron job:** `sync-worker-every-2-min` calls the function every 2 minutes via:
  
  ```sql
  net.http_get('https://xgvaibxxiwfraklfbwey.functions.supabase.co/sync-worker')
  ```
- **pg_cron** and **pg_net** extensions are already installed (do NOT create or drop extensions)
- No authentication headers are required for this function.

## Notes
- All scheduling is now internal to Supabase. No external cron or cloud scheduler is used.
- The function is public and does not require API keys or Authorization headers.
