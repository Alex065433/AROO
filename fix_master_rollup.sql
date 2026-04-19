
-- Ensure master_id and master_account_id exist for Multi-Node Rollup
DO $$ 
BEGIN 
    -- profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'master_id') THEN
        ALTER TABLE profiles ADD COLUMN master_id UUID REFERENCES auth.users(id);
    END IF;

    -- members
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'master_account_id') THEN
        ALTER TABLE members ADD COLUMN master_account_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Team Collection Table Sync Fix
CREATE TABLE IF NOT EXISTS team_collection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID REFERENCES profiles(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    name TEXT,
    balance NUMERIC DEFAULT 0,
    eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
