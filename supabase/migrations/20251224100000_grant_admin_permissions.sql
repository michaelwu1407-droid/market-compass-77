-- Grant admin access to a user
-- IMPORTANT: Replace '''YOUR_USER_ID''' with the actual user ID from the Supabase auth.users table
INSERT INTO public.user_roles (user_id, role)
VALUES ('5cef1cb6-1d52-40de-b24e-6233d41cf28d', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
