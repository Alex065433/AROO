-- Update profiles table to support MLM logic
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS matching_volume JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb,
ADD COLUMN IF NOT EXISTS daily_income JSONB DEFAULT '{"date": "", "amount": 0}'::jsonb,
ADD COLUMN IF NOT EXISTS total_income NUMERIC DEFAULT 0;

-- Ensure team_size is initialized
UPDATE public.profiles SET team_size = '{"left": 0, "right": 0}'::jsonb WHERE team_size IS NULL;
UPDATE public.profiles SET matching_volume = '{"left": 0, "right": 0}'::jsonb WHERE matching_volume IS NULL;
UPDATE public.profiles SET daily_income = '{"date": "", "amount": 0}'::jsonb WHERE daily_income IS NULL;
