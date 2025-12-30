# Workaround: Self-Scheduling Sync Worker

Since we can't modify pg_cron directly, here's a workaround that will make the system work:

## Option 1: Use External Cron Service (Easiest)

You can use a free service like:
- **cron-job.org** (free)
- **EasyCron** (free tier)
- **GitHub Actions** (already set up)

Set up a cron job to call:
```
https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-worker
```
Headers:
```
Content-Type: application/json
```

Note: `sync-worker` is configured as public (`verify_jwt = false`), so no Authorization header is required.

Schedule: Every 2 minutes

## Asset Turbo Mode (Optional)

To get stock sectors/fundamentals and 5Y price history filled in faster, add two more cron jobs:

1) **Enrich assets (sectors/fundamentals)**
- URL: `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/enrich-assets-yahoo`
- Method: POST
- Schedule: every 15 minutes (`*/15 * * * *`)
- Body: `{}`

2) **Backfill 5Y price history**
- URL: `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/backfill-asset-history`
- Method: POST
- Schedule: staggered every 15 minutes (`7,22,37,52 * * * *`)
- Body: `{}`

## Post Linking (Recommended)

To prevent Trader profile Posts tabs from being empty due to missing `posts.trader_id`, add:

3) **Backfill posts → traders linkage**
- URL: `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/fix-posts?only_missing_trader_id=true&limit=200&offset=0`
- Method: POST
- Schedule: every 10 minutes (`*/10 * * * *`)
- Body: `{}`

## Daily Page Data (Recommended)

If the Daily page is empty, schedule these once per day (timing depends on your market and timezone):

4) **Fetch Daily Prices**
- URL: `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/fetch-daily-prices`
- Method: POST
- Schedule: daily (after market close)
- Body: `{}`

5) **Scrape Daily Movers**
- URL: `https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/scrape-daily-movers`
- Method: POST
- Schedule: daily (shortly after Fetch Daily Prices)
- Body: `{}`

## Option 2: Contact Supabase Support

Ask them to:
1. Enable pg_cron management for your project
2. Or run the migration SQL for you with superuser access

## Option 3: Manual Trigger (Temporary)

For now, you can manually click "Force Process Queue" on the Admin page every few minutes until we get cron working.

