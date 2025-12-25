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
     Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M
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

That's it! The system will now run automatically.

## Alternative: GitHub Actions (Already Available)

We can also set up GitHub Actions to call these endpoints on a schedule. Would you like me to do that?

