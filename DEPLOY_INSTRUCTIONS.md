# Deployment Instructions

## Option 1: Deploy via GitHub Actions (Recommended)

The deployment workflow has been updated to include all new functions. To deploy:

1. **Commit and push your changes:**
   ```bash
   git add .
   git commit -m "Add sync pipeline diagnostic functions and fixes"
   git push origin main
   ```

2. **Monitor deployment:**
   - Go to your GitHub repository
   - Click on "Actions" tab
   - Watch the "Deploy Supabase Functions" workflow run
   - All functions will be deployed automatically

## Option 2: Deploy Manually via Supabase CLI

If you have Supabase CLI installed locally:

```bash
# Set your project ID
export PROJECT_ID=xgvaibxxiwfraklfbwey

# Deploy all functions
supabase functions deploy sync-traders --project-ref $PROJECT_ID
supabase functions deploy sync-trader-details --project-ref $PROJECT_ID
supabase functions deploy sync-worker --project-ref $PROJECT_ID
supabase functions deploy enqueue-sync-jobs --project-ref $PROJECT_ID
supabase functions deploy process-sync-job --project-ref $PROJECT_ID
supabase functions deploy dispatch-sync-jobs --project-ref $PROJECT_ID
supabase functions deploy verify-deployment --project-ref $PROJECT_ID
supabase functions deploy force-process-queue --project-ref $PROJECT_ID
supabase functions deploy sync-diagnostics --project-ref $PROJECT_ID
```

## Option 3: Deploy via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to Edge Functions
3. For each function, click "Deploy" and upload the function folder

## Functions Being Deployed

### New Functions:
- ✅ `verify-deployment` - Checks deployment status
- ✅ `force-process-queue` - Processes all pending jobs
- ✅ `sync-diagnostics` - Real-time monitoring

### Updated Functions:
- ✅ `sync-trader-details` - Fixed incomplete implementation
- ✅ `sync-worker` - Enhanced with queue refill
- ✅ `sync-traders` - Enhanced trader creation

### Existing Functions (already in workflow):
- ✅ `process-sync-job`
- ✅ `dispatch-sync-jobs`
- ✅ `enqueue-sync-jobs`
- ✅ `run-migration`

## After Deployment

1. Go to your Admin Sync Page
2. Click "Verify Deployment" to confirm all functions are working
3. Click "Force Process Queue" to clear pending jobs
4. Monitor the trader count - it should start increasing!

## Troubleshooting

If deployment fails:
- Check that `SUPABASE_ACCESS_TOKEN` secret is set in GitHub
- Verify project ID is correct: `xgvaibxxiwfraklfbwey`
- Check Supabase dashboard for function deployment errors

