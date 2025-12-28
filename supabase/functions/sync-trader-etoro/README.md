# sync-trader-etoro

Best-effort trader profile enrichment from an eToro JSON endpoint.

## Configuration

Set these environment variables for the function:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` (optional; will fall back to request origin)
- `ETORO_TRADER_PROFILE_URL`
  - URL template supporting `{username}` and/or `{cid}` placeholders
  - Recommended (most reliable): `https://www.etoro.com/sapi/rankings/cid/{cid}/rankings?period=OneYearAgo`
  - Alternate (username search): `https://www.etoro.com/api/search/v1/users?prefix={username}&count=1&format=json`

## Request

POST JSON:

```json
{ "username": "SomeTrader" }
```

Or (when using a `{cid}` template):

```json
{ "cid": 12345678 }
```

If you pass only `cid`, the function will try to look up `etoro_username` from the `traders` table (by `etoro_cid`) before upserting.

## Notes

- This function only updates `traders` fields; it does not sync holdings.
- Holdings/portfolio syncing remains handled by `sync-trader-details`.
