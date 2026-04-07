CREATE OR REPLACE FUNCTION activate_mlm(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
DECLARE
    v_num_ids INT;
    v_left_add INT;
    v_right_add INT;
    v_referral_income NUMERIC;
    v_matching_income NUMERIC;
    v_pairs INT;
    v_new_pairs INT;
    v_paid_pairs INT;
    v_left_count INT;
    v_right_count INT;
    v_i INT;
    v_new_id UUID;
    v_operator_id TEXT;
BEGIN
    -- 1. Generate IDs based on packageAmount (packageAmount / 50)
    v_num_ids := FLOOR(p_amount / 50);
    
    IF v_num_ids <= 0 THEN
        RETURN;
    END IF;

    -- Calculate left and right additions
    v_left_add := FLOOR(v_num_ids / 2.0);
    v_right_add := CEIL(v_num_ids / 2.0);

    -- 2. Insert new users with referrer_id = userId
    FOR v_i IN 1..v_num_ids LOOP
        v_new_id := gen_random_uuid();
        v_operator_id := 'ARW-GEN-' || floor(random() * 900000 + 100000)::TEXT;
        
        INSERT INTO profiles (
            id, email, operator_id, sponsor_id, parent_id, side, 
            status, role, full_name, is_active, active_package
        ) VALUES (
            v_new_id, 
            v_operator_id || '@arowin.internal', 
            v_operator_id, 
            p_user_id, 
            p_user_id, -- Just attaching to parent for record
            CASE WHEN v_i <= v_left_add THEN 'LEFT' ELSE 'RIGHT' END,
            'active', 
            'user', 
            'Generated ID', 
            true, 
            50
        );
    END LOOP;

    -- 3. Add referral income (IDs × 2.5) to the user
    v_referral_income := v_num_ids * 2.5;

    -- Get current counts and paid pairs
    SELECT COALESCE(left_count, 0), COALESCE(right_count, 0), COALESCE(paid_pairs, 0)
    INTO v_left_count, v_right_count, v_paid_pairs
    FROM profiles
    WHERE id = p_user_id;

    -- 4. Update binary counts and business
    v_left_count := v_left_count + v_left_add;
    v_right_count := v_right_count + v_right_add;

    -- 5. Calculate matching pairs
    v_pairs := LEAST(v_left_count, v_right_count);
    v_new_pairs := v_pairs - v_paid_pairs;
    
    IF v_new_pairs < 0 THEN
        v_new_pairs := 0;
    END IF;

    -- 6. Add matching income (new_pairs × 5)
    v_matching_income := v_new_pairs * 5.0;

    -- 7. Update the user
    UPDATE profiles
    SET 
        wallet_balance = COALESCE(wallet_balance, 0) + v_referral_income + v_matching_income,
        referral_income = COALESCE(referral_income, 0) + v_referral_income,
        matching_income = COALESCE(matching_income, 0) + v_matching_income,
        total_income = COALESCE(total_income, 0) + v_referral_income + v_matching_income,
        left_count = v_left_count,
        right_count = v_right_count,
        left_business = COALESCE(left_business, 0) + (v_left_add * 50),
        right_business = COALESCE(right_business, 0) + (v_right_add * 50),
        paid_pairs = v_paid_pairs + v_new_pairs,
        active_package = COALESCE(active_package, 0) + p_amount,
        is_active = true
    WHERE id = p_user_id;

    -- 8. Log transactions
    IF v_referral_income > 0 THEN
        INSERT INTO transactions (user_id, uid, amount, type, description, status)
        VALUES (p_user_id, p_user_id, v_referral_income, 'income', 'Referral Income from Package Generation', 'completed');
    END IF;

    IF v_matching_income > 0 THEN
        INSERT INTO transactions (user_id, uid, amount, type, description, status)
        VALUES (p_user_id, p_user_id, v_matching_income, 'income', 'Matching Income from Package Generation', 'completed');
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
