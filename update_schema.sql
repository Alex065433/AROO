
-- Add main_user_id column to profiles
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'main_user_id') THEN
        ALTER TABLE profiles ADD COLUMN main_user_id UUID;
    END IF;
END $$;

-- Add uid column to team_collection if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_collection' AND column_name = 'uid') THEN
        ALTER TABLE team_collection ADD COLUMN uid UUID;
    END IF;
END $$;
