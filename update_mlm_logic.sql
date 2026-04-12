-- Update profiles table with necessary columns for the new business plan
DO $$ 
BEGIN 
    -- Add binary_qualified column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'binary_qualified') THEN
        ALTER TABLE profiles ADD COLUMN binary_qualified BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add daily_matching_income for capping
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'daily_matching_income') THEN
        ALTER TABLE profiles ADD COLUMN daily_matching_income NUMERIC DEFAULT 0;
    END IF;

    -- Add last_matching_date for capping reset
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_matching_date') THEN
        ALTER TABLE profiles ADD COLUMN last_matching_date DATE DEFAULT CURRENT_DATE;
    END IF;
    
    -- Add rank column if it's not there (though it should be)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'rank') THEN
        ALTER TABLE profiles ADD COLUMN rank INTEGER DEFAULT 0;
    END IF;
END $$;

-- 1. Function to check and update user ranks based on PDF criteria
CREATE OR REPLACE FUNCTION update_user_ranks()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    v_new_rank INTEGER;
BEGIN
    FOR r IN SELECT id, left_count, right_count, rank FROM profiles WHERE active_package > 0 LOOP
        v_new_rank := 0;
        
        -- Rank Eligibility Criteria (Page 10)
        IF r.left_count >= 10000 AND r.right_count >= 10000 THEN v_new_rank := 12; -- Global Ambassador
        ELSIF r.left_count >= 5000 AND r.right_count >= 5000 THEN v_new_rank := 11; -- Royal Legend
        ELSIF r.left_count >= 2500 AND r.right_count >= 2500 THEN v_new_rank := 10; -- Titanium King
        ELSIF r.left_count >= 1000 AND r.right_count >= 1000 THEN v_new_rank := 9;  -- Emerald Crown
        ELSIF r.left_count >= 500 AND r.right_count >= 500 THEN v_new_rank := 8;   -- Ruby Elite
        ELSIF r.left_count >= 250 AND r.right_count >= 250 THEN v_new_rank := 7;   -- Blue Sapphire
        ELSIF r.left_count >= 100 AND r.right_count >= 100 THEN v_new_rank := 6;   -- Diamond
        ELSIF r.left_count >= 31 AND r.right_count >= 31 THEN v_new_rank := 5;     -- Platina
        ELSIF r.left_count >= 15 AND r.right_count >= 15 THEN v_new_rank := 4;     -- Gold
        ELSIF r.left_count >= 7 AND r.right_count >= 7 THEN v_new_rank := 3;       -- Silver
        ELSIF r.left_count >= 3 AND r.right_count >= 3 THEN v_new_rank := 2;       -- Bronze
        ELSIF r.left_count >= 1 AND r.right_count >= 1 THEN v_new_rank := 1;       -- Starter
        END IF;

        IF v_new_rank > COALESCE(r.rank, 0) THEN
            UPDATE profiles SET rank = v_new_rank WHERE id = r.id;
            
            -- Log rank achievement
            INSERT INTO transactions (uid, user_id, amount, type, description, status)
            VALUES (r.id, r.id, 0, 'rank_update', 'Promoted to Rank ' || v_new_rank, 'completed');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Updated Binary Matching with Capping and 1:2/2:1 Qualification
CREATE OR REPLACE FUNCTION process_binary_matching()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    v_matched_volume NUMERIC;
    v_new_matching_volume NUMERIC;
    v_matching_income NUMERIC;
    v_capping NUMERIC;
    v_pair_income NUMERIC;
    v_pairs_to_pay INTEGER;
    v_actual_income_to_pay NUMERIC;
BEGIN
    -- Reset daily capping if date changed
    UPDATE profiles SET daily_matching_income = 0, last_matching_date = CURRENT_DATE WHERE last_matching_date < CURRENT_DATE;

    FOR r IN SELECT id, left_business, right_business, matching_volume, rank, binary_qualified, daily_matching_income, left_count, right_count FROM profiles WHERE active_package > 0 LOOP
        
        -- 1. Check Binary Qualification (1:2 or 2:1 for the first pair)
        IF NOT r.binary_qualified THEN
            IF (r.left_count >= 1 AND r.right_count >= 2) OR (r.left_count >= 2 AND r.right_count >= 1) THEN
                UPDATE profiles SET binary_qualified = TRUE WHERE id = r.id;
                -- After qualification, they are eligible for matching
            ELSE
                CONTINUE; -- Not qualified yet
            END IF;
        END IF;

        -- 2. Calculate Matching
        -- We match in blocks of $50 (Page 8: Left $50 + Right $50 = $5 per pair)
        v_matched_volume := LEAST(COALESCE(r.left_business, 0.0), COALESCE(r.right_business, 0.0));
        v_new_matching_volume := v_matched_volume - COALESCE(r.matching_volume, 0.0);
        
        IF v_new_matching_volume >= 50 THEN
            -- Calculate how many pairs of $50 we have
            v_pairs_to_pay := FLOOR(v_new_matching_volume / 50);
            
            -- Get capping and pair income based on rank (Page 11)
            CASE r.rank
                WHEN 12 THEN v_pair_income := 25; v_capping := 2500; -- Global Ambassador
                WHEN 11 THEN v_pair_income := 10; v_capping := 900;  -- Royal Legend
                WHEN 10 THEN v_pair_income := 8;  v_capping := 640;  -- Titanium King
                WHEN 9  THEN v_pair_income := 7;  v_capping := 490;  -- Emerald Crown
                WHEN 8  THEN v_pair_income := 6;  v_capping := 360;  -- Ruby Elite
                ELSE v_pair_income := 5; v_capping := 250; -- Starter to Blue Sapphire
            END CASE;

            v_matching_income := v_pairs_to_pay * v_pair_income;
            
            -- Apply Daily Capping
            v_actual_income_to_pay := LEAST(v_matching_income, v_capping - COALESCE(r.daily_matching_income, 0.0));
            
            IF v_actual_income_to_pay > 0 THEN
                UPDATE profiles 
                SET matching_income = COALESCE(matching_income, 0.0) + v_actual_income_to_pay,
                    total_income = COALESCE(total_income, 0.0) + v_actual_income_to_pay,
                    daily_matching_income = COALESCE(daily_matching_income, 0.0) + v_actual_income_to_pay,
                    matching_volume = COALESCE(matching_volume, 0.0) + (v_pairs_to_pay * 50)
                WHERE id = r.id;

                -- Log matching income transaction
                INSERT INTO transactions (uid, user_id, amount, type, description, status)
                VALUES (r.id, r.id, v_actual_income_to_pay, 'income', 'Binary Matching Income (' || v_pairs_to_pay || ' pairs)', 'completed');
                
                -- If capped, log the loss in capping box (optional but good for UI)
                IF v_matching_income > v_actual_income_to_pay THEN
                    INSERT INTO transactions (uid, user_id, amount, type, description, status)
                    VALUES (r.id, r.id, v_matching_income - v_actual_income_to_pay, 'capping_loss', 'Income lost due to daily capping', 'completed');
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Process Weekly Rank Bonus (Page 12)
CREATE OR REPLACE FUNCTION process_weekly_rank_bonus()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    v_weekly_bonus NUMERIC;
BEGIN
    FOR r IN SELECT id, rank FROM profiles WHERE active_package > 0 AND rank > 0 LOOP
        CASE r.rank
            WHEN 1  THEN v_weekly_bonus := 4;
            WHEN 2  THEN v_weekly_bonus := 6;
            WHEN 3  THEN v_weekly_bonus := 10;
            WHEN 4  THEN v_weekly_bonus := 16;
            WHEN 5  THEN v_weekly_bonus := 31;
            WHEN 6  THEN v_weekly_bonus := 50;
            WHEN 7  THEN v_weekly_bonus := 125;
            WHEN 8  THEN v_weekly_bonus := 250;
            WHEN 9  THEN v_weekly_bonus := 500;
            WHEN 10 THEN v_weekly_bonus := 1000;
            WHEN 11 THEN v_weekly_bonus := 2500;
            WHEN 12 THEN v_weekly_bonus := 10000;
            ELSE v_weekly_bonus := 0;
        END CASE;

        IF v_weekly_bonus > 0 THEN
            UPDATE profiles 
            SET rank_bonus_income = COALESCE(rank_bonus_income, 0.0) + v_weekly_bonus,
                total_income = COALESCE(total_income, 0.0) + v_weekly_bonus
            WHERE id = r.id;

            -- Log weekly bonus transaction
            INSERT INTO transactions (uid, user_id, amount, type, description, status)
            VALUES (r.id, r.id, v_weekly_bonus, 'income', 'Weekly Rank Bonus', 'completed');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update process_all_incomes to include new logic
CREATE OR REPLACE FUNCTION process_all_incomes()
RETURNS VOID AS $$
BEGIN
    PERFORM update_user_ranks();
    PERFORM process_daily_yield();
    PERFORM process_binary_matching();
    -- Note: process_weekly_rank_bonus should be called separately once a week
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
