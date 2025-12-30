# How to Check Supabase Logs

## Option 1: Supabase Dashboard (Easiest)

1. Go to https://supabase.com/dashboard
2. Select your project: `xgvaibxxiwfraklfbwey`
3. Click on **"Logs"** in the left sidebar
4. Select **"Edge Functions"** from the dropdown
5. Filter by function name:
   - `enqueue-sync-jobs` - Check if jobs are being created
   - `dispatch-sync-jobs` - Check if jobs are being processed
   - `sync-worker` - Check if the worker is running
   - `sync-traders` - Check if traders are being discovered

## Option 2: Use the Diagnostic Function

Call the `sync-diagnostics` function from your admin page or via curl:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  https://xgvaibxxiwfraklfbwey.supabase.co/functions/v1/sync-diagnostics
```

## Option 3: Run the Smoke Test Script

If you want a repeatable way to validate production end-to-end (without guessing from UI), run the local smoke test:

- See `SMOKE_TEST.md`
- Script: `scripts/smoke-validate.ps1`

## What to Look For in Logs

### For `enqueue-sync-jobs`:
- Look for: "Found X stale traders"
- Look for: "Inserted batch X: Y jobs"
- Look for: "Error inserting batch" - This will show what's failing
- Look for: "Permission/RLS error" - This indicates access issues

### For `dispatch-sync-jobs`:
- Look for: "Found X pending jobs"
- Look for: "Successfully processed job"
- Look for: "Failed to invoke process-sync-job"

### For `sync-worker`:
- Look for: "Invoking dispatch-sync-jobs"
- Look for: "Queue is low" - Indicates when it tries to refill
- Look for: "Enqueued new jobs"

## Common Issues to Check

1. **Permission Errors**: Look for "permission denied" or "policy" in error messages
2. **RLS Errors**: Look for "row-level security" in error messages
3. **Insert Errors**: Look for "Error inserting batch" - check the error details
4. **Empty Results**: Look for "Found 0 stale traders" - might indicate query issues

