-- 1. Add user_id to traders table
ALTER TABLE public.traders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Drop the old RLS policies
DROP POLICY IF EXISTS "Anyone can view traders" ON public.traders;

-- 3. Create new RLS policies
-- 3.1. Users can view all trader profiles
CREATE POLICY "Users can view all trader profiles" ON public.traders FOR SELECT USING (auth.role() = 'authenticated');

-- 3.2. Users can create a trader profile for themselves
CREATE POLICY "Users can create their own trader profile" ON public.traders FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3.3. Users can update their own trader profile
CREATE POLICY "Users can update their own trader profile" ON public.traders FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3.4. Users can delete their own trader profile
CREATE POLICY "Users can delete their own trader profile" ON public.traders FOR DELETE USING (auth.uid() = user_id);