
-- MLM Logic Update - Production Ready
-- ID Value: $50
-- Direct Income: 5% ($2.50)
-- Matching Income: 10% ($5.00 per pair)
-- Ranks: Starter (1L, 1R), Bronze (3L, 3R Starters)

-- 1. Schema Updates
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS left_starters INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS right_starters INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_starter BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_bronze BOOLEAN DEFAULT FALSE;

-- 2. BFS Function for Placement
CREATE OR REPLACE FUNCTION get_next_binary_slot(p_root_id UUID)
RETURNS TABLE (parent_id UUID, side TEXT) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE tree_levels AS (
        SELECT id, 0 as level, created_at
        FROM profiles
        WHERE id = p_root_id
        UNION ALL
        SELECT p.id, tl.level + 1, p.created_at
        FROM profiles p
        JOIN tree_levels tl ON p.parent_id = tl.id
    )
    SELECT 
        q.id as parent_id,
        CASE 
            WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE parent_id = q.id AND side = 'LEFT') THEN 'LEFT'
            ELSE 'RIGHT'
        END as side
    FROM (
        SELECT tl.id, tl.level, tl.created_at
        FROM tree_levels tl
        WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE parent_id = tl.id AND side = 'LEFT')
           OR NOT EXISTS (SELECT 1 FROM profiles WHERE parent_id = tl.id AND side = 'RIGHT')
        ORDER BY tl.level ASC, tl.created_at ASC
        LIMIT 1
    ) q;
END;
$$ LANGUAGE plpgsql;

-- 3. Core Activation Function
CREATE OR REPLACE FUNCTION activate_unit_id_v2(
    p_user_id UUID,
    p_sponsor_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_current_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_matching_bonus NUMERIC := 5.00;
    v_direct_bonus NUMERIC := 2.50;
    v_match INTEGER;
BEGIN
    -- 1. Activate Profile
    UPDATE profiles 
    SET is_active = true,
        status = 'active',
        active_package = 50,
        package_amount = 50,
        activated_at = NOW()
    WHERE id = p_user_id;

    -- 2. Direct Referral Bonus (Strictly to Direct Sponsor Only)
    IF p_sponsor_id IS NOT NULL THEN
        UPDATE profiles 
        SET referral_income = COALESCE(referral_income, 0) + v_direct_bonus,
            total_income = COALESCE(total_income, 0) + v_direct_bonus,
            wallet_balance = COALESCE(wallet_balance, 0) + v_direct_bonus,
            wallets = jsonb_set(
                wallets, 
                '{master,balance}', 
                (COALESCE((wallets->'master'->>'balance')::numeric, 0) + v_direct_bonus)::text::jsonb
            )
        WHERE id = p_sponsor_id;

        INSERT INTO transactions (uid, user_id, amount, type, description, status)
        VALUES (p_sponsor_id, p_sponsor_id, v_direct_bonus, 'referral', 'Direct Referral Bonus ($2.50)', 'completed');
    END IF;

    -- 3. Update Counts and Matching Up the Chain
    v_current_id := p_user_id;
    LOOP
        SELECT parent_id, side INTO v_parent_id, v_side FROM profiles WHERE id = v_current_id;
        EXIT WHEN v_parent_id IS NULL;

        -- Increment available and total counts
        IF v_side = 'LEFT' THEN
            UPDATE profiles 
            SET left_count = left_count + 1,
                team_size = jsonb_set(team_size, '{left}', (COALESCE((team_size->>'left')::int, 0) + 1)::text::jsonb)
            WHERE id = v_parent_id;
        ELSE
            UPDATE profiles 
            SET right_count = right_count + 1,
                team_size = jsonb_set(team_size, '{right}', (COALESCE((team_size->>'right')::int, 0) + 1)::text::jsonb)
            WHERE id = v_parent_id;
        End IF;

        -- Process Matching: min(left_count, right_count) with subtraction
        SELECT LEAST(left_count, right_count) INTO v_match FROM profiles WHERE id = v_parent_id;
        
        IF v_match > 0 THEN
            UPDATE profiles 
            SET left_count = left_count - v_match,
                right_count = right_count - v_match,
                matched_pairs = COALESCE(matched_pairs, 0) + v_match,
                matching_income = COALESCE(matching_income, 0) + (v_match * v_matching_bonus),
                total_income = COALESCE(total_income, 0) + (v_match * v_matching_bonus),
                wallet_balance = COALESCE(wallet_balance, 0) + (v_match * v_matching_bonus),
                wallets = jsonb_set(
                    wallets, 
                    '{master,balance}', 
                    (COALESCE((wallets->'master'->>'balance')::numeric, 0) + (v_match * v_matching_bonus))::text::jsonb
                )
            WHERE id = v_parent_id;

            INSERT INTO transactions (uid, user_id, amount, type, description, status)
            VALUES (v_parent_id, v_parent_id, v_match * v_matching_bonus, 'matching', 'Matching Income: ' || v_match || ' pair(s)', 'completed');
            
            -- Check for Starter Rank
            PERFORM update_starter_status_v2(v_parent_id);
        END IF;

        v_current_id := v_parent_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Starter Status Updater
CREATE OR REPLACE FUNCTION update_starter_status_v2(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_active_l INTEGER;
    v_active_r INTEGER;
    v_is_already_starter BOOLEAN;
    v_parent_id UUID;
    v_side TEXT;
BEGIN
    SELECT is_starter INTO v_is_already_starter FROM profiles WHERE id = p_user_id;
    IF COALESCE(v_is_already_starter, FALSE) THEN RETURN; END IF;

    -- A Starter is someone with 1 personal activation on left and 1 on right
    -- We can check the actual active children
    SELECT count(*) INTO v_active_l FROM profiles WHERE parent_id = p_user_id AND side = 'LEFT' AND is_active = true;
    SELECT count(*) INTO v_active_r FROM profiles WHERE parent_id = p_user_id AND side = 'RIGHT' AND is_active = true;

    IF v_active_l >= 1 AND v_active_r >= 1 THEN
        UPDATE profiles SET is_starter = true, rank = 1 WHERE id = p_user_id;
        
        -- Increment Starter counts for parents
        SELECT parent_id, side INTO v_parent_id, v_side FROM profiles WHERE id = p_user_id;
        IF v_parent_id IS NOT NULL THEN
            IF v_side = 'LEFT' THEN
                UPDATE profiles SET left_starters = left_starters + 1 WHERE id = v_parent_id;
            ELSE
                UPDATE profiles SET right_starters = right_starters + 1 WHERE id = v_parent_id;
            END IF;
            
            -- Check Bronze for parent
            PERFORM check_bronze_rank_v2(v_parent_id);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Bronze Rank Checker
CREATE OR REPLACE FUNCTION check_bronze_rank_v2(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_l_starters INTEGER;
    v_r_starters INTEGER;
    v_is_already_bronze BOOLEAN;
BEGIN
    SELECT is_bronze, left_starters, right_starters INTO v_is_already_bronze, v_l_starters, v_r_starters FROM profiles WHERE id = p_user_id;
    IF COALESCE(v_is_already_bronze, FALSE) THEN RETURN; END IF;

    IF v_l_starters >= 3 AND v_r_starters >= 3 THEN
        UPDATE profiles SET is_bronze = true, rank = 2 WHERE id = p_user_id;
        INSERT INTO notifications (uid, title, content, type)
        VALUES (p_user_id, 'Rank Achieved: Bronze', 'You have achieved Bronze rank with 3 Starter achievers on each side.', 'rank');
    END IF;
END;
$$ LANGUAGE plpgsql;
