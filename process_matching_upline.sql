CREATE OR REPLACE FUNCTION process_matching_upline(start_user_id UUID, trigger_user_id UUID DEFAULT NULL)
RETURNS void AS $$
DECLARE
    current_id UUID;
BEGIN
    current_id := start_user_id;

    WHILE current_id IS NOT NULL LOOP
        PERFORM process_matching(current_id, trigger_user_id);

        SELECT parent_id INTO current_id
        FROM profiles
        WHERE id = current_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION process_matching(p_user_id UUID, p_trigger_user_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_left_business NUMERIC;
    v_right_business NUMERIC;
    v_matching_volume NUMERIC;
    v_matched_volume NUMERIC;
    v_new_matching_volume NUMERIC;
    v_matching_income NUMERIC;
    v_description TEXT;
    v_trigger_operator_id TEXT;
    v_eligible_nodes INT;
    v_node_income NUMERIC;
BEGIN
    -- Get current business volumes with row-level locking
    SELECT left_business, right_business, matching_volume 
    INTO v_left_business, v_right_business, v_matching_volume
    FROM profiles 
    WHERE id = p_user_id AND active_package > 0
    FOR UPDATE;

    -- If user is not active, do nothing
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Calculate total matched volume (the lesser of the two legs)
    v_matched_volume := LEAST(COALESCE(v_left_business, 0.0), COALESCE(v_right_business, 0.0));
    
    -- Calculate new matching volume since the last time this was processed
    v_new_matching_volume := v_matched_volume - COALESCE(v_matching_volume, 0.0);
    
    IF v_new_matching_volume > 0 THEN
        -- Matching Income (e.g., 10% of the new matched volume), rounded to 2 decimal places
        v_matching_income := ROUND((v_new_matching_volume * 0.10)::NUMERIC, 2);
        
        -- Determine trigger operator ID for description
        IF p_trigger_user_id IS NOT NULL THEN
            SELECT operator_id INTO v_trigger_operator_id FROM profiles WHERE id = p_trigger_user_id;
        END IF;

        -- Check for eligible team collection nodes
        SELECT COUNT(*) INTO v_eligible_nodes 
        FROM team_collection 
        WHERE uid = p_user_id AND eligible = true;
        
        -- Update profiles, ensuring amounts are rounded
        UPDATE profiles 
        SET matching_income = ROUND((COALESCE(matching_income, 0.0) + v_matching_income)::NUMERIC, 2),
            total_income = ROUND((COALESCE(total_income, 0.0) + v_matching_income)::NUMERIC, 2),
            matching_volume = v_matched_volume
        WHERE id = p_user_id;

        IF v_eligible_nodes > 0 THEN
            -- Log transaction per node, rounded
            v_node_income := ROUND((v_matching_income / v_eligible_nodes)::NUMERIC, 2);
            
            INSERT INTO transactions (uid, user_id, amount, type, description, status)
            SELECT p_user_id, p_user_id, v_node_income, 'income', 
                   'Binary Matching Income for Node ' || node_id || COALESCE(' from ' || v_trigger_operator_id, ''), 
                   'completed'
            FROM team_collection 
            WHERE uid = p_user_id AND eligible = true;
        ELSE
            -- Standard logging
            v_description := 'Binary Matching Income' || COALESCE(' from ' || v_trigger_operator_id, '');
            
            INSERT INTO transactions (uid, user_id, amount, type, description, status)
            VALUES (p_user_id, p_user_id, v_matching_income, 'income', v_description, 'completed');
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
