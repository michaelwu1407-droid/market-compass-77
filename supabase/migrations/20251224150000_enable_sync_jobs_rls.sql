-- Enable RLS on sync_jobs
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view sync jobs (for the admin dashboard)
CREATE POLICY "Anyone can view sync_jobs" ON public.sync_jobs FOR SELECT USING (true);

-- Allow authenticated users to update sync jobs (e.g., for retrying failed jobs)
CREATE POLICY "Authenticated can update sync_jobs" ON public.sync_jobs FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete sync jobs (if needed for cleanup)
CREATE POLICY "Authenticated can delete sync_jobs" ON public.sync_jobs FOR DELETE USING (auth.role() = 'authenticated');
