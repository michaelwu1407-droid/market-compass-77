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

That's it! The system will now run automatically.

Note: `sync-worker` is configured as public (`verify_jwt = false`), so you do not need an Authorization header.

Note: `enrich-assets-yahoo` and `backfill-asset-history` are also configured as public (`verify_jwt = false`) so external cron can call them without auth.

## Alternative: GitHub Actions (Already Available)

We can also set up GitHub Actions to call these endpoints on a schedule. Would you like me to do that?

