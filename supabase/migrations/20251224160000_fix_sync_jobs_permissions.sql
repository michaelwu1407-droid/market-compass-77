-- Grant usage on schema public to anon and authenticated roles (usually default, but good to ensure)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant SELECT permissions on sync_jobs to anon and authenticated roles
GRANT SELECT ON public.sync_jobs TO anon, authenticated;

-- Ensure RLS is enabled
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts/duplicates
DROP POLICY IF EXISTS "Anyone can view sync_jobs" ON public.sync_jobs;

-- Create a definitive policy for viewing sync jobs
CREATE POLICY "Anyone can view sync_jobs" 
ON public.sync_jobs 
FOR SELECT 
USING (true);

-- Ensure authenticated users can also insert/update (if the admin page does this directly)
GRANT ALL ON public.sync_jobs TO authenticated;

-- Policy for authenticated users to manage jobs
CREATE POLICY "Authenticated users can manage sync_jobs" 
ON public.sync_jobs 
FOR ALL 
USING (auth.role() = 'authenticated');
