
-- Fix income_ledger schema to support modern types and status
ALTER TABLE income_ledger DROP CONSTRAINT IF EXISTS income_ledger_type_check;

-- Update columns to be more flexible
ALTER TABLE income_ledger ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';
ALTER TABLE income_ledger ALTER COLUMN earned_by_node_id DROP NOT NULL; -- Sub-nodes created via Edge Function might use string IDs or we might not have UUID immediately

-- Relax check constraint to allow current types from Edge Functions
ALTER TABLE income_ledger ADD CONSTRAINT income_ledger_type_check 
CHECK (type IN ('direct_referral', 'binary_matching', 'capping_income', 'rank_bonus', 'roi_yield', 'DAILY_ROI', 'MATCHING_BONUS', 'DIRECT_REFERRAL', 'RANK_BONUS'));

-- Ensure user_id column exists and is UUID (already is, but just in case)
-- Ensure earned_by_node_id column is flexible
ALTER TABLE income_ledger RENAME COLUMN earned_by_node_id TO earned_by_node_uuid;
ALTER TABLE income_ledger ADD COLUMN IF NOT EXISTS earned_by_node_id TEXT; -- For ARW-V-XXXX strings

-- Add updated_at
ALTER TABLE income_ledger ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Also fix daily_roi_tracking to ensure description exists if needed
ALTER TABLE daily_roi_tracking ADD COLUMN IF NOT EXISTS description TEXT;

-- REDEFINE claim_wallet to sync with user_wallets table
DROP FUNCTION IF EXISTS claim_wallet(uuid, text);
CREATE OR REPLACE FUNCTION claim_wallet(p_user_id UUID, p_wallet_key TEXT)
RETURNS JSONB AS $$
DECLARE
    v_profile RECORD;
    v_balance NUMERIC;
    v_wallets JSONB;
    v_master_balance NUMERIC;
BEGIN
    -- Get user profile
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    v_wallets := v_profile.wallets;
    
    -- Sync with user_wallets table if P_WALLET_KEY is yield or referral
    IF p_wallet_key = 'yield' THEN
        SELECT network_yield_box INTO v_balance FROM user_wallets WHERE id = p_user_id;
    ELSIF p_wallet_key = 'referral' THEN
        SELECT referral_box INTO v_balance FROM user_wallets WHERE id = p_user_id;
    ELSE
        -- Fallback to JSONB for others
        v_balance := (COALESCE(v_wallets->p_wallet_key->>'balance', '0'))::NUMERIC;
    END IF;
    
    IF COALESCE(v_balance, 0) <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No balance to claim');
    END IF;

    -- Update Table Data (Source of Truth)
    IF p_wallet_key = 'yield' THEN
        UPDATE user_wallets SET network_yield_box = 0, master_vault = master_vault + v_balance WHERE id = p_user_id;
    ELSIF p_wallet_key = 'referral' THEN
        UPDATE user_wallets SET referral_box = 0, master_vault = master_vault + v_balance WHERE id = p_user_id;
    ELSE
        -- Default: handle via Master Vault anyway
        UPDATE user_wallets SET master_vault = master_vault + v_balance WHERE id = p_user_id;
    END IF;

    -- Update JSONB for Legacy Compatibility
    v_wallets := jsonb_set(COALESCE(v_wallets, '{}'::jsonb), ARRAY[p_wallet_key, 'balance'], '0');
    v_master_balance := (COALESCE(v_wallets->'master'->>'balance', '0'))::NUMERIC + v_balance;
    v_wallets := jsonb_set(v_wallets, ARRAY['master', 'balance'], v_master_balance::TEXT::jsonb);

    -- Update profile
    UPDATE profiles 
    SET wallets = v_wallets,
        wallet_balance = COALESCE(wallet_balance, 0) + v_balance
    WHERE id = p_user_id;

    -- Log transaction in BOTH tables for best visibility
    INSERT INTO transactions (user_id, amount, type, description, status)
    VALUES (p_user_id, v_balance, 'claim', 'Claimed ' || p_wallet_key || ' to Master Vault', 'COMPLETED');
    
    INSERT INTO payments (uid, amount, type, method, description, status, currency)
    VALUES (p_user_id, v_balance, 'claim', 'INTERNAL', 'Claimed ' || p_wallet_key || ' to Master Vault', 'finished', 'usdtbsc');

    RETURN jsonb_build_object('success', true, 'claimed_amount', v_balance, 'new_master_balance', v_master_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
