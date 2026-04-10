
-- 1. Recursive function to get binary downline
CREATE OR REPLACE FUNCTION get_binary_downline(root_id UUID)
RETURNS SETOF profiles AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE downline AS (
        -- Base case: the root node
        SELECT * FROM profiles WHERE id = root_id
        UNION ALL
        -- Recursive case: children of the nodes in the downline
        SELECT p.* FROM profiles p
        INNER JOIN downline d ON p.parent_id = d.id
    )
    SELECT * FROM downline;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Function to claim wallet balance to master vault
-- DROP first to avoid return type change error
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
    
    -- Check if wallet exists and has balance
    IF NOT (v_wallets ? p_wallet_key) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Wallet not found');
    END IF;

    v_balance := (v_wallets->p_wallet_key->>'balance')::NUMERIC;
    
    IF v_balance <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No balance to claim');
    END IF;

    -- Update wallets
    -- 1. Reset specific wallet balance
    v_wallets := jsonb_set(v_wallets, ARRAY[p_wallet_key, 'balance'], '0');
    
    -- 2. Add to master wallet
    v_master_balance := (COALESCE(v_wallets->'master'->>'balance', '0'))::NUMERIC;
    v_master_balance := v_master_balance + v_balance;
    v_wallets := jsonb_set(v_wallets, ARRAY['master', 'balance'], v_master_balance::TEXT::jsonb);

    -- Update profile
    UPDATE profiles 
    SET wallets = v_wallets,
        wallet_balance = COALESCE(wallet_balance, 0) + v_balance
    WHERE id = p_user_id;

    -- Log transaction
    INSERT INTO payments (uid, amount, type, method, description, status, currency)
    VALUES (p_user_id, v_balance, 'claim', 'INTERNAL', 'Claimed ' || p_wallet_key || ' to Master Vault', 'finished', 'usdtbsc');

    RETURN jsonb_build_object('success', true, 'claimed_amount', v_balance, 'new_master_balance', v_master_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to update binary counts and business up the tree
CREATE OR REPLACE FUNCTION update_binary_count(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_current_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_package_amount NUMERIC;
BEGIN
    -- Get the package amount of the user that triggered the update
    SELECT active_package INTO v_package_amount FROM profiles WHERE id = p_user_id;
    IF v_package_amount IS NULL THEN v_package_amount := 0; END IF;

    v_current_id := p_user_id;
    
    LOOP
        -- Get parent and side
        SELECT parent_id, side INTO v_parent_id, v_side FROM profiles WHERE id = v_current_id;
        EXIT WHEN v_parent_id IS NULL;

        -- Update parent's counts and business
        IF v_side = 'LEFT' THEN
            UPDATE profiles 
            SET left_count = COALESCE(left_count, 0) + 1,
                left_business = COALESCE(left_business, 0.0) + v_package_amount,
                left_volume = COALESCE(left_volume, 0.0) + v_package_amount
            WHERE id = v_parent_id;
        ELSE
            UPDATE profiles 
            SET right_count = COALESCE(right_count, 0) + 1,
                right_business = COALESCE(right_business, 0.0) + v_package_amount,
                right_volume = COALESCE(right_volume, 0.0) + v_package_amount
            WHERE id = v_parent_id;
        END IF;

        -- Move up
        v_current_id := v_parent_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Rebuild all counts (Utility function)
CREATE OR REPLACE FUNCTION rebuild_team_sizes()
RETURNS VOID AS $$
BEGIN
    -- Reset all counts
    UPDATE profiles 
    SET left_count = 0, 
        right_count = 0, 
        left_business = 0, 
        right_business = 0,
        left_volume = 0,
        right_volume = 0;

    -- Recalculate for every active user
    -- This is slow but ensures consistency
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN SELECT id FROM profiles WHERE active_package > 0 LOOP
            PERFORM update_binary_count(r.id);
        END LOOP;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
