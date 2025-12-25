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
With header:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M
```

Schedule: Every 2 minutes

## Option 2: Contact Supabase Support

Ask them to:
1. Enable pg_cron management for your project
2. Or run the migration SQL for you with superuser access

## Option 3: Manual Trigger (Temporary)

For now, you can manually click "Force Process Queue" on the Admin page every few minutes until we get cron working.

