CREATE OR REPLACE FUNCTION activate_package(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
DECLARE
    v_sponsor_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_current_id UUID;
    v_referral_bonus NUMERIC;
    v_operator_id TEXT;
BEGIN
    -- Get operator_id for description
    SELECT operator_id INTO v_operator_id FROM profiles WHERE id = p_user_id;

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
        VALUES (v_sponsor_id, v_sponsor_id, v_referral_bonus, 'income', 'Direct Referral Bonus from ' || COALESCE(v_operator_id, p_user_id::TEXT), 'completed');
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
