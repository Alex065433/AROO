
-- Migration for activate-package requirements
CREATE TABLE IF NOT EXISTS voxmeta_wallets (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    master_vault NUMERIC(20, 2) DEFAULT 0,
    referral_dividends NUMERIC(20, 2) DEFAULT 0,
    matching_dividends NUMERIC(20, 2) DEFAULT 0,
    roi_dividends NUMERIC(20, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_roi_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    node_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    activation_amount NUMERIC(20, 2) DEFAULT 50,
    daily_percent NUMERIC(5, 2) DEFAULT 0.5,
    max_limit NUMERIC(20, 2) DEFAULT 100,
    total_paid NUMERIC(20, 2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    last_payout TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure profiles has master_id for Team Collection mapping
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS master_id UUID REFERENCES auth.users(id);

-- Backfill voxmeta_wallets from existing user_wallets if they exist
INSERT INTO voxmeta_wallets (id, master_vault)
SELECT id, master_balance FROM user_wallets
ON CONFLICT (id) DO NOTHING;
