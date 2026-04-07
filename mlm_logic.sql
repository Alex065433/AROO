-- Add yield_income column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'yield_income') THEN
        ALTER TABLE profiles ADD COLUMN yield_income NUMERIC DEFAULT 0;
    END IF;
END $$;

-- 1. Activate Package RPC
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
        total_deposit = COALESCE(total_deposit, 0.0) + p_amount,
        status = 'active',
        is_active = true
    WHERE id = p_user_id;

    -- 2. Direct Referral Bonus (5% of package price)
    SELECT sponsor_id INTO v_sponsor_id FROM profiles WHERE id = p_user_id;
    IF v_sponsor_id IS NOT NULL THEN
        v_referral_bonus := p_amount * 0.05;
        
        -- Update sponsor's income
        UPDATE profiles 
        SET referral_income = COALESCE(referral_income, 0.0) + v_referral_bonus,
            total_income = COALESCE(total_income, 0.0) + v_referral_bonus
        WHERE id = v_sponsor_id;

        -- Log transaction
        INSERT INTO transactions (uid, user_id, amount, type, description, status)
        VALUES (v_sponsor_id, v_sponsor_id, v_referral_bonus, 'income', 'Direct Referral Bonus from ' || p_user_id, 'completed');
    END IF;

    -- 3. Update Tree Volumes and Counts
    v_current_id := p_user_id;
    LOOP
        SELECT parent_id, side INTO v_parent_id, v_side FROM profiles WHERE id = v_current_id;
        EXIT WHEN v_parent_id IS NULL;

        IF v_side = 'LEFT' THEN
            UPDATE profiles 
            SET left_business = COALESCE(left_business, 0.0) + p_amount,
                left_count = COALESCE(left_count, 0) + 1,
                left_volume = COALESCE(left_volume, 0.0) + p_amount
            WHERE id = v_parent_id;
        ELSE
            UPDATE profiles 
            SET right_business = COALESCE(right_business, 0.0) + p_amount,
                right_count = COALESCE(right_count, 0) + 1,
                right_volume = COALESCE(right_volume, 0.0) + p_amount
            WHERE id = v_parent_id;
        END IF;

        v_current_id := v_parent_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Process Daily Yield RPC
CREATE OR REPLACE FUNCTION process_daily_yield()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    v_yield NUMERIC;
    v_referral_yield NUMERIC;
BEGIN
    FOR r IN SELECT id, active_package, sponsor_id FROM profiles WHERE active_package > 0 LOOP
        -- 1. Calculate Daily Yield (0.5% of active package)
        v_yield := r.active_package * 0.005;
        
        -- Update user's flat income columns
        UPDATE profiles 
        SET daily_income = COALESCE(daily_income, 0.0) + v_yield,
            yield_income = COALESCE(yield_income, 0.0) + v_yield,
            total_income = COALESCE(total_income, 0.0) + v_yield
        WHERE id = r.id;

        -- Log yield transaction
        INSERT INTO transactions (uid, user_id, amount, type, description, status)
        VALUES (r.id, r.id, v_yield, 'income', 'Daily Yield Income', 'completed');

        -- 2. Direct Referral Yield (10% of the referral's yield)
        IF r.sponsor_id IS NOT NULL THEN
            v_referral_yield := v_yield * 0.10;
            
            UPDATE profiles 
            SET referral_income = COALESCE(referral_income, 0.0) + v_referral_yield,
                total_income = COALESCE(total_income, 0.0) + v_referral_yield
            WHERE id = r.sponsor_id;

            -- Log referral yield transaction
            INSERT INTO transactions (uid, user_id, amount, type, description, status)
            VALUES (r.sponsor_id, r.sponsor_id, v_referral_yield, 'income', 'Direct Referral Yield from ' || r.id, 'completed');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Process Binary Matching Income RPC
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
        v_matched_volume := LEAST(COALESCE(r.left_business, 0.0), COALESCE(r.right_business, 0.0));
        
        -- Calculate new matching volume since the last time this was processed
        v_new_matching_volume := v_matched_volume - COALESCE(r.matching_volume, 0.0);
        
        IF v_new_matching_volume > 0 THEN
            -- Matching Income (e.g., 10% of the new matched volume)
            v_matching_income := v_new_matching_volume * 0.10;
            
            -- Update user's income and record the new matched volume
            UPDATE profiles 
            SET matching_income = COALESCE(matching_income, 0.0) + v_matching_income,
                total_income = COALESCE(total_income, 0.0) + v_matching_income,
                matching_volume = v_matched_volume
            WHERE id = r.id;

            -- Log matching income transaction
            INSERT INTO transactions (uid, user_id, amount, type, description, status)
            VALUES (r.id, r.id, v_matching_income, 'income', 'Binary Matching Income', 'completed');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Process All Incomes RPC
CREATE OR REPLACE FUNCTION process_all_incomes()
RETURNS VOID AS $$
BEGIN
    PERFORM process_daily_yield();
    PERFORM process_binary_matching();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
