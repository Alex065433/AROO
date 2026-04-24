-- Migration: Add is_virtual to profiles and update user_wallets
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT false;

-- Ensure user_wallets has the requested columns if they are named differently
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS master_vault NUMERIC(20, 2) DEFAULT 0;
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS referral_box NUMERIC(20, 2) DEFAULT 0;

-- Sync existing data if needed (optional, depends on previous state)
-- UPDATE user_wallets SET master_vault = master_balance WHERE master_vault = 0 AND master_balance > 0;
-- UPDATE user_wallets SET referral_box = direct_referral_balance WHERE referral_box = 0 AND direct_referral_balance > 0;
