-- Ensure service role can insert into sync_jobs
-- Service role should bypass RLS, but let's add an explicit policy to be safe

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Service can manage sync_jobs" ON public.sync_jobs;

-- Create policy that allows service role to insert/update/delete
CREATE POLICY "Service can manage sync_jobs" ON public.sync_jobs FOR ALL USING (true) WITH CHECK (true);

-- Also ensure service role has direct grants
GRANT ALL ON public.sync_jobs TO service_role;

