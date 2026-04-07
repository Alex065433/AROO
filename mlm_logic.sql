-- Add yield_income column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'yield_income') THEN
        ALTER TABLE profiles ADD COLUMN yield_income NUMERIC DEFAULT 0;
    END IF;
END $$;

-- 1. Activate Package RPC
-- This function handles the core logic of activating a package for a user.
-- It updates the user's status, calculates the direct referral bonus for the sponsor,
-- and traverses up the binary tree to update business volumes and member counts.
CREATE OR REPLACE FUNCTION activate_package(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
DECLARE
    v_sponsor_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_current_id UUID;
    v_referral_bonus NUMERIC;
BEGIN
    -- 1. Update user's profile
    UPDATE profiles 
    SET active_package = p_amount,
        total_deposit = COALESCE(total_deposit, 0) + p_amount,
        status = 'active',
        is_active = true
    WHERE id = p_user_id;

    -- 2. Direct Referral Bonus (5% of package price)
    -- This is a one-time bonus paid to the direct sponsor when a referral activates a package.
    SELECT sponsor_id INTO v_sponsor_id FROM profiles WHERE id = p_user_id;
    IF v_sponsor_id IS NOT NULL THEN
        v_referral_bonus := p_amount * 0.05;
        
        -- Update sponsor's wallet and income
        UPDATE profiles 
        SET referral_income = COALESCE(referral_income, 0) + v_referral_bonus,
            total_income = COALESCE(total_income, 0) + v_referral_bonus,
            wallets = jsonb_set(
                COALESCE(wallets, '{}'::jsonb),
                '{referral,balance}',
                (COALESCE((wallets->'referral'->>'balance')::NUMERIC, 0) + v_referral_bonus)::TEXT::jsonb
            )
        WHERE id = v_sponsor_id;

        -- Log transaction
        INSERT INTO transactions (uid, amount, type, description, status)
        VALUES (v_sponsor_id, v_referral_bonus, 'referral_bonus', 'Direct Referral Bonus from ' || p_user_id, 'completed');
    END IF;

    -- 3. Update Tree Volumes and Counts
    -- This loop traverses up the binary tree from the user to the root,
    -- adding the package amount to the business volume of every ancestor.
    v_current_id := p_user_id;
    LOOP
        SELECT parent_id, side INTO v_parent_id, v_side FROM profiles WHERE id = v_current_id;
        EXIT WHEN v_parent_id IS NULL;

        IF v_side = 'LEFT' THEN
            UPDATE profiles 
            SET left_business = COALESCE(left_business, 0) + p_amount,
                left_count = COALESCE(left_count, 0) + 1,
                left_volume = COALESCE(left_volume, 0) + p_amount
            WHERE id = v_parent_id;
        ELSE
            UPDATE profiles 
            SET right_business = COALESCE(right_business, 0) + p_amount,
                right_count = COALESCE(right_count, 0) + 1,
                right_volume = COALESCE(right_volume, 0) + p_amount
            WHERE id = v_parent_id;
        END IF;

        v_current_id := v_parent_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Process Daily Yield RPC
-- This function calculates the daily ROI (Yield) for all active users.
-- It also calculates the "Direct Referral Yield", which is a percentage of the yield
-- earned by a user's direct referrals.
CREATE OR REPLACE FUNCTION process_daily_yield()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    v_yield NUMERIC;
    v_referral_yield NUMERIC;
    v_sponsor_id UUID;
BEGIN
    FOR r IN SELECT id, active_package, sponsor_id FROM profiles WHERE active_package > 0 LOOP
        -- 1. Calculate Daily Yield (0.5% of active package)
        v_yield := r.active_package * 0.005;
        
        -- Update user's yield wallet and flat income columns
        UPDATE profiles 
        SET daily_income = COALESCE(daily_income, 0) + v_yield,
            yield_income = COALESCE(yield_income, 0) + v_yield,
            total_income = COALESCE(total_income, 0) + v_yield,
            wallets = jsonb_set(
                COALESCE(wallets, '{}'::jsonb),
                '{yield,balance}',
                (COALESCE((wallets->'yield'->>'balance')::NUMERIC, 0) + v_yield)::TEXT::jsonb
            )
        WHERE id = r.id;

        -- Log yield transaction
        INSERT INTO transactions (uid, amount, type, description, status)
        VALUES (r.id, v_yield, 'yield', 'Daily Yield Income', 'completed');

        -- 2. Direct Referral Yield (10% of the referral's yield)
        -- This is paid to the sponsor based on the yield earned by their direct referrals.
        IF r.sponsor_id IS NOT NULL THEN
            v_referral_yield := v_yield * 0.10;
            
            UPDATE profiles 
            SET referral_income = COALESCE(referral_income, 0) + v_referral_yield,
                total_income = COALESCE(total_income, 0) + v_referral_yield,
                wallets = jsonb_set(
                    COALESCE(wallets, '{}'::jsonb),
                    '{referral,balance}',
                    (COALESCE((wallets->'referral'->>'balance')::NUMERIC, 0) + v_referral_yield)::TEXT::jsonb
                )
            WHERE id = r.sponsor_id;

            -- Log referral yield transaction
            INSERT INTO transactions (uid, amount, type, description, status)
            VALUES (r.sponsor_id, v_referral_yield, 'referral_yield', 'Direct Referral Yield from ' || r.id, 'completed');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Process Binary Matching Income RPC
-- This function calculates binary matching income based on the balanced volume
-- between the left and right legs of a user's tree.
CREATE OR REPLACE FUNCTION process_binary_matching()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    v_matched_volume NUMERIC;
    v_new_matching_volume NUMERIC;
    v_matching_income NUMERIC;
BEGIN
    FOR r IN SELECT id, left_business, right_business, matching_volume FROM profiles WHERE active_package > 0 LOOP
        -- Calculate total matched volume (the lesser of the two legs)
        v_matched_volume := LEAST(COALESCE(r.left_business, 0), COALESCE(r.right_business, 0));
        
        -- Calculate new matching volume since the last time this was processed
        v_new_matching_volume := v_matched_volume - COALESCE(r.matching_volume, 0);
        
        IF v_new_matching_volume > 0 THEN
            -- Matching Income (e.g., 10% of the new matched volume)
            v_matching_income := v_new_matching_volume * 0.10;
            
            -- Update user's matching wallet, total income, and record the new matched volume
            UPDATE profiles 
            SET matching_income = COALESCE(matching_income, 0) + v_matching_income,
                total_income = COALESCE(total_income, 0) + v_matching_income,
                matching_volume = v_matched_volume,
                wallets = jsonb_set(
                    COALESCE(wallets, '{}'::jsonb),
                    '{matching,balance}',
                    (COALESCE((wallets->'matching'->>'balance')::NUMERIC, 0) + v_matching_income)::TEXT::jsonb
                )
            WHERE id = r.id;

            -- Log matching income transaction
            INSERT INTO transactions (uid, amount, type, description, status)
            VALUES (r.id, v_matching_income, 'matching_income', 'Binary Matching Income', 'completed');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
