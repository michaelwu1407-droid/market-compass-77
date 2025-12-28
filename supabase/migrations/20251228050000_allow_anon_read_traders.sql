-- Allow anonymous users to read trader profiles.
-- The frontend uses the anon key by default; restricting SELECT to authenticated breaks the public feed.

ALTER TABLE public.traders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view traders" ON public.traders;
CREATE POLICY "Anyone can view traders" ON public.traders
  FOR SELECT
  USING (true);
