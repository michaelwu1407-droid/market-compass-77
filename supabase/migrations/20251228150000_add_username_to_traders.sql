-- Add `username` column to traders to match the original trader sync contract.
--
-- Requirements:
-- 1) Add username text column (if missing)
-- 2) Backfill from existing identifier (etoro_username)
-- 3) Add a unique index on username

ALTER TABLE public.traders
  ADD COLUMN IF NOT EXISTS username text;

-- Backfill username from etoro_username (do not overwrite existing usernames)
UPDATE public.traders
SET username = etoro_username
WHERE username IS NULL
  AND etoro_username IS NOT NULL;

-- Unique index (Postgres allows multiple NULLs, but after backfill this should be unique)
CREATE UNIQUE INDEX IF NOT EXISTS traders_username_unique
  ON public.traders (username);
