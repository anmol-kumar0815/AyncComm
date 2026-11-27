-- Add has_password column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_password BOOLEAN DEFAULT FALSE;

-- If you are running this on existing data, you might want to set the seeded users to TRUE
UPDATE public.profiles SET has_password = TRUE WHERE email IN ('dev_user@example.com', 'alice@example.com', 'bob@example.com');
