-- Add eToro-derived identifiers/metrics to traders
-- Safe/idempotent: uses IF NOT EXISTS.

ALTER TABLE public.traders
  ADD COLUMN IF NOT EXISTS etoro_cid TEXT,
  ADD COLUMN IF NOT EXISTS win_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS last_etoro_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trader_source TEXT;

-- Optional: keep source consistent
UPDATE public.traders
SET trader_source = COALESCE(trader_source, 'bullaware')
WHERE trader_source IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS traders_etoro_cid_idx
  ON public.traders (etoro_cid);

-- eToro CID should be unique when present
CREATE UNIQUE INDEX IF NOT EXISTS traders_etoro_cid_unique
  ON public.traders (etoro_cid)
  WHERE etoro_cid IS NOT NULL;
