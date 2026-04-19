
-- Migration to support Multi-Node Rollup and Team Collection Incomes

-- 1. Add master_account_id to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS master_account_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_members_master_account ON members(master_account_id);

-- 2. Create incomes table for precise tracking
CREATE TABLE IF NOT EXISTS incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL, -- The owner (Master Node)
    earned_by_node_id UUID REFERENCES auth.users(id) NOT NULL, -- The specific node that earned it
    amount NUMERIC(20, 2) NOT NULL,
    type TEXT NOT NULL, -- 'direct_referral', 'binary_matching'
    description TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'collected'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incomes_user ON incomes(user_id);
CREATE INDEX IF NOT EXISTS idx_incomes_node ON incomes(earned_by_node_id);
CREATE INDEX IF NOT EXISTS idx_incomes_status ON incomes(status);

-- 3. Ensure team_collection table has necessary fields
ALTER TABLE team_collection ADD COLUMN IF NOT EXISTS node_id_uuid UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_team_collection_node_uuid ON team_collection(node_id_uuid);
