# sync-trader-etoro

Best-effort trader profile enrichment from an eToro JSON endpoint.

## Configuration

Set these environment variables for the function:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` (optional; will fall back to request origin)
- `ETORO_TRADER_PROFILE_URL`
  - URL template supporting `{username}` placeholder
  - Example: `https://example.etoro.endpoint/profile?username={username}`

## Request

POST JSON:

```json
{ "username": "SomeTrader" }
```

## Notes

- This function only updates `traders` fields; it does not sync holdings.
- Holdings/portfolio syncing remains handled by `sync-trader-details`.
