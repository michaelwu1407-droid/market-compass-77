-- Ensure service role can insert into sync_jobs
-- Service role should bypass RLS, but let's add an explicit policy to be safe

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Service can manage sync_jobs" ON public.sync_jobs;

-- Create policy that allows service role (and anyone with service role key) to insert/update/delete
-- Service role key bypasses RLS, but this policy ensures authenticated service calls work
CREATE POLICY "Service can manage sync_jobs" 
ON public.sync_jobs 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Also ensure service role has direct grants (though it should bypass RLS)
GRANT ALL ON public.sync_jobs TO service_role;

