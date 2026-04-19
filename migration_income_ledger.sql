
-- Migration for MLM Income Ledger and Claimable Balance

-- 1. Sequence for ARW- IDs
CREATE SEQUENCE IF NOT EXISTS operator_id_seq START WITH 100000;

-- 2. Add claimable_balance to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS claimable_balance NUMERIC(20, 2) DEFAULT 0;

-- 3. Create income_ledger for better categorization
CREATE TABLE IF NOT EXISTS income_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL, -- Owner of the wallet (Master)
    earned_by_node_id UUID REFERENCES auth.users(id) NOT NULL, -- The specific node that generated the income
    amount NUMERIC(20, 2) NOT NULL,
    type TEXT CHECK (type IN ('direct_referral', 'binary_matching', 'capping_income', 'rank_bonus', 'roi_yield')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_ledger_user ON income_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_income_ledger_node ON income_ledger(earned_by_node_id);

-- 4. RPC for "Claim" logic
CREATE OR REPLACE FUNCTION claim_node_earnings(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_total_claimable NUMERIC;
BEGIN
    -- Sum all claimable balances for the user's nodes
    SELECT SUM(claimable_balance) INTO v_total_claimable
    FROM members m
    JOIN profiles p ON m.id = p.id
    WHERE p.id = p_user_id OR p.master_id = p_user_id;

    IF v_total_claimable > 0 THEN
        -- Zero out claimable balances
        UPDATE members m
        SET claimable_balance = 0
        FROM profiles p
        WHERE m.id = p.id AND (p.id = p_user_id OR p.master_id = p_user_id);

        -- Move to Master Wallet
        UPDATE profiles
        SET wallet_balance = COALESCE(wallet_balance, 0) + v_total_claimable
        WHERE id = p_user_id;

        -- Log the claim
        INSERT INTO transactions (user_id, amount, type, description, status)
        VALUES (p_user_id, v_total_claimable, 'claim', 'Claimed earnings from node collection', 'completed');
    END IF;

    RETURN COALESCE(v_total_claimable, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC for Sequential Operator IDs
CREATE OR REPLACE FUNCTION get_next_operator_id()
RETURNS BIGINT AS $$
BEGIN
    RETURN nextval('operator_id_seq');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
