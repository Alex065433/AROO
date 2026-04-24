
-- Final refining migration for Edge Function compatibility

-- 1. Ensure profiles has two_fa_pin
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS two_fa_pin TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. Update income_ledger to include status
ALTER TABLE income_ledger ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- 3. Create user_wallets for segregated balance tracking
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    master_balance NUMERIC(20, 2) DEFAULT 0,
    direct_referral_balance NUMERIC(20, 2) DEFAULT 0,
    binary_matching_balance NUMERIC(20, 2) DEFAULT 0,
    roi_yield_balance NUMERIC(20, 2) DEFAULT 0,
    rank_bonus_balance NUMERIC(20, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to create wallet on profile creation
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER AS $
BEGIN
    -- Only insert if the user exists in auth.users to satisfy the foreign key
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
        INSERT INTO user_wallets (id) VALUES (NEW.id)
        ON CONFLICT (id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_wallet ON profiles;
CREATE TRIGGER trg_create_wallet
AFTER INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION create_user_wallet();

-- Backfill wallets for existing users (only those that exist in auth.users)
INSERT INTO user_wallets (id, master_balance)
SELECT p.id, COALESCE(p.wallet_balance, 0) 
FROM profiles p
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ON CONFLICT (id) DO NOTHING;
