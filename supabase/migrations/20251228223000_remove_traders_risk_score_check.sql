-- Allow arbitrary risk_score values (remove check constraint that enforced a small range)

DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname
  INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'traders'
    AND c.contype = 'c'
    AND c.conname = 'traders_risk_score_check';

  IF conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.traders DROP CONSTRAINT ' || quote_ident(conname);
  END IF;
END $$;

-- Also handle inline column-level checks that might have auto-generated different names
-- by dropping any CHECK constraint expression that references "risk_score".
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'traders'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%risk_score%'
  LOOP
    EXECUTE 'ALTER TABLE public.traders DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;
