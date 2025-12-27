# fix-posts Supabase Edge Function

This function performs a one-time migration to reclassify, reformat, and update all existing posts in the database using the latest extraction and classification logic.

## Usage

Deploy and invoke this function once to update all posts. It will:
- Extract the most readable text from each post
- Classify the content (readable, guid_like, short, missing)
- Clean up formatting
- Update classification and metadata columns

## Deployment

```
supabase functions deploy fix-posts
```

## Invocation

```
supabase functions invoke fix-posts --no-verify-jwt
```

## Safety
- This function is idempotent and can be run multiple times.
- Only existing posts are updated; no new posts are created.
