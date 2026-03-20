
-- Update profiles table for multiple accounts per email and admin activation
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS real_email TEXT;

-- Update handle_new_user trigger to set default status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, real_email, operator_id, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email,
    'ARW-' || floor(random() * 900000 + 100000)::text,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.email = 'kethankumar130@gmail.com' THEN 'admin' ELSE 'user' END,
    'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
