# Quick Setup: External Cron Service

Since Supabase pg_cron requires superuser access, use a free external cron service:

## Recommended: cron-job.org (Free)

1. **Go to:** https://cron-job.org/en/
2. **Sign up** (free account)
3. **Create new cron job:**
   - **Title:** Sync Worker
   - **Address:** `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker`
   - **Schedule:** Every 2 minutes (`*/2 * * * *`)
   - **Request method:** POST
   - **Request headers:** 
     ```
     Content-Type: application/json
     ```
   - **Request body:** `{}`

4. **Create second cron job:**
   - **Title:** Discover New Traders
   - **Address:** `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enqueue-sync-jobs`
   - **Schedule:** Every hour (`0 * * * *`)
   - **Request method:** POST
   - **Request headers:** Same as above
   - **Request body:** `{"sync_traders": true}`

5. **Create third cron job (Asset Sectors/Fundamentals):**
   - **Title:** Enrich Assets (Yahoo)
   - **Address:** `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enrich-assets-yahoo`
   - **Schedule (recommended turbo):** Every 15 minutes (`*/15 * * * *`)
   - **Request method:** POST
   - **Request headers:**
     ```
     Content-Type: application/json
     ```
   - **Request body:** `{}`

6. **Create fourth cron job (5Y Price History Backfill):**
   - **Title:** Backfill Asset History (5Y)
   - **Address:** `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/backfill-asset-history`
   - **Schedule (recommended turbo, staggered):** `7,22,37,52 * * * *`
   - **Request method:** POST
   - **Request headers:**
     ```
     Content-Type: application/json
     ```
   - **Request body:** `{}`

7. **Create fifth cron job (Posts → Trader linking):**
    - **Title:** Backfill Post Links
   - **Address:** `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/fix-posts?only_missing_trader_id=true&limit=200&offset=0`
    - **Schedule:** Every 10 minutes (`*/10 * * * *`)
    - **Request method:** POST
    - **Request headers:**
       ```
       Content-Type: application/json
       ```
    - **Request body:** `{}`

8. **Create sixth cron job (Daily Prices):**
    - **Title:** Fetch Daily Prices
   - **Address:** `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/fetch-daily-prices?max_assets=250`
    - **Schedule:** Once daily (recommended: after market close in UTC, adjust as needed)
    - **Request method:** POST
    - **Request headers:**
       ```
       Content-Type: application/json
       ```
    - **Request body:** `{}`

   Note: `fetch-daily-prices` is intentionally batched by default to avoid Edge compute limits; adjust `max_assets` if you want a bigger/smaller batch.

9. **Create seventh cron job (Daily Movers):**
    - **Title:** Scrape Daily Movers
    - **Address:** `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/scrape-daily-movers`
    - **Schedule:** Once daily (recommended: shortly after Daily Prices)
    - **Request method:** POST
    - **Request headers:**
       ```
       Content-Type: application/json
       ```
    - **Request body:** `{}`

That's it! The system will now run automatically.

Note: `sync-worker` is configured as public (`verify_jwt = false`), so you do not need an Authorization header.

Note: `enrich-assets-yahoo` and `backfill-asset-history` are also configured as public (`verify_jwt = false`) so external cron can call them without auth.

Note: `fix-posts`, `fetch-daily-prices`, and `scrape-daily-movers` should also be public (`verify_jwt = false`) if you are calling them without an Authorization header.

## Alternative: GitHub Actions (Already Available)

We can also set up GitHub Actions to call these endpoints on a schedule. Would you like me to do that?

