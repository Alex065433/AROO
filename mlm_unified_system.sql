-- MLM Unified System Script v2
-- This script consolidates all MLM logic into a single trigger on the 'purchases' table.
-- It also handles binary count updates on user registration.

-- 1. Ensure necessary columns exist in 'profiles'
DO $$ 
BEGIN 
    -- Volume Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'left_business') THEN
        ALTER TABLE profiles ADD COLUMN left_business NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'right_business') THEN
        ALTER TABLE profiles ADD COLUMN right_business NUMERIC DEFAULT 0;
    END IF;
    
    -- Count Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'left_count') THEN
        ALTER TABLE profiles ADD COLUMN left_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'right_count') THEN
        ALTER TABLE profiles ADD COLUMN right_count INTEGER DEFAULT 0;
    END IF;

    -- Matching Tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'matching_vol') THEN
        ALTER TABLE profiles ADD COLUMN matching_vol NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'matched_pairs') THEN
        ALTER TABLE profiles ADD COLUMN matched_pairs NUMERIC DEFAULT 0;
    END IF;

    -- JSONB Columns for Frontend Compatibility
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallets') THEN
        ALTER TABLE profiles ADD COLUMN wallets JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'team_size') THEN
        ALTER TABLE profiles ADD COLUMN team_size JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb;
    END IF;
END $$;

-- 2. Create 'purchases' table if not exists
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID REFERENCES profiles(id),
    amount NUMERIC NOT NULL,
    package_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE
);

-- 3. Master MLM Processing Function
CREATE OR REPLACE FUNCTION process_purchase_mlm()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_amount NUMERIC;
    v_sponsor_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_current_id UUID;
    v_p_id UUID;
    v_p_side TEXT;
    v_left_bus NUMERIC;
    v_right_bus NUMERIC;
    v_old_matching_vol NUMERIC;
    v_matched_vol NUMERIC;
    v_new_pairs INTEGER;
    v_pair_income NUMERIC;
    v_ref_income NUMERIC;
    v_operator_id TEXT;
    v_sub_node_id UUID;
    v_sub_operator_id TEXT;
    v_node_count INTEGER;
    v_node_ids UUID[];
    v_sub_parent_id UUID;
    v_sub_side TEXT;
    v_p_idx INTEGER;
BEGIN
    v_user_id := NEW.uid;
    v_amount := NEW.amount;

    -- A. Direct Referral Bonus (5%)
    SELECT sponsor_id, operator_id INTO v_sponsor_id, v_operator_id FROM profiles WHERE id = v_user_id;
    IF v_sponsor_id IS NOT NULL THEN
        v_ref_income := v_amount * 0.05;
        UPDATE profiles 
        SET wallets = jsonb_set(
            COALESCE(wallets, '{}'::jsonb),
            '{referral,balance}',
            (COALESCE((wallets->'referral'->>'balance')::numeric, 0) + v_ref_income)::text::jsonb
        )
        WHERE id = v_sponsor_id;
        
        INSERT INTO transactions (uid, amount, type, description)
        VALUES (v_sponsor_id, v_ref_income, 'referral', 'Direct Referral Bonus from ' || v_operator_id);
    END IF;

    -- B. ID Generation (Team Collection)
    -- $50 = 1 ID, $150 = 3 IDs, etc.
    v_node_count := floor(v_amount / 50);
    v_node_ids := array_append(v_node_ids, v_user_id); -- Root node is the user themselves
    
    IF v_node_count > 1 THEN
        FOR v_i IN 2..v_node_count LOOP
            v_p_idx := floor(v_i / 2); -- 1-based index of parent in v_node_ids
            v_sub_parent_id := v_node_ids[v_p_idx];
            v_sub_side := CASE WHEN v_i % 2 = 0 THEN 'LEFT' ELSE 'RIGHT' END;
            v_sub_operator_id := v_operator_id || '-' || LPAD((v_i-1)::text, 2, '0');
            
            INSERT INTO profiles (
                operator_id, name, email, parent_id, side, sponsor_id, role, active_package, wallets
            ) VALUES (
                v_sub_operator_id, 'Node ' || v_sub_operator_id, v_sub_operator_id || '@internal',
                v_sub_parent_id, v_sub_side, v_sponsor_id, 'node', 50, '{}'::jsonb
            ) RETURNING id INTO v_sub_node_id;
            
            v_node_ids := array_append(v_node_ids, v_sub_node_id);

            -- Team Collection Income ($10 when both children filled)
            -- In a perfect binary tree, every RIGHT child added completes a pair for its parent
            IF v_sub_side = 'RIGHT' THEN
                UPDATE profiles 
                SET wallets = jsonb_set(
                    COALESCE(wallets, '{}'::jsonb),
                    '{master,balance}',
                    (COALESCE((wallets->'master'->>'balance')::numeric, 0) + 10)::text::jsonb
                )
                WHERE id = v_user_id;
                
                INSERT INTO transactions (uid, amount, type, description)
                VALUES (v_user_id, 10, 'team_collection', 'Team Collection Income from Node ' || v_sub_operator_id);
            END IF;
        END LOOP;
    END IF;

    -- C. Volume Distribution & Matching Income (10%)
    -- We distribute volume for EACH ID generated (each is $50)
    FOR v_i IN 1..v_node_count LOOP
        v_current_id := v_node_ids[v_i];
        
        LOOP
            SELECT parent_id, side INTO v_p_id, v_p_side FROM profiles WHERE id = v_current_id;
            EXIT WHEN v_p_id IS NULL;

            -- Update Parent Volume
            IF v_p_side = 'LEFT' THEN
                UPDATE profiles 
                SET left_business = COALESCE(left_business, 0) + 50,
                    team_size = jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), '{left}', (COALESCE((team_size->>'left')::int, 0) + 1)::text::jsonb)
                WHERE id = v_p_id;
            ELSE
                UPDATE profiles 
                SET right_business = COALESCE(right_business, 0) + 50,
                    team_size = jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), '{right}', (COALESCE((team_size->>'right')::int, 0) + 1)::text::jsonb)
                WHERE id = v_p_id;
            END IF;

            -- Calculate Matching for Parent
            SELECT left_business, right_business, matching_vol INTO v_left_bus, v_right_bus, v_old_matching_vol FROM profiles WHERE id = v_p_id;
            v_matched_vol := LEAST(v_left_bus, v_right_bus);
            
            IF v_matched_vol > COALESCE(v_old_matching_vol, 0) THEN
                v_new_pairs := floor((v_matched_vol - COALESCE(v_old_matching_vol, 0)) / 50);
                IF v_new_pairs > 0 THEN
                    v_pair_income := v_new_pairs * 5; -- 10% of $50 is $5
                    
                    UPDATE profiles 
                    SET matching_vol = v_matched_vol,
                        matched_pairs = COALESCE(matched_pairs, 0) + v_new_pairs,
                        wallets = jsonb_set(
                            COALESCE(wallets, '{}'::jsonb),
                            '{matching,balance}',
                            (COALESCE((wallets->'matching'->>'balance')::numeric, 0) + v_pair_income)::text::jsonb
                        )
                    WHERE id = v_p_id;

                    INSERT INTO transactions (uid, amount, type, description)
                    VALUES (v_p_id, v_pair_income, 'matching', 'Matching Income: ' || v_new_pairs || ' pairs generated');
                END IF;
            END IF;

            v_current_id := v_p_id;
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Registration Trigger (Binary Count Update)
CREATE OR REPLACE FUNCTION process_new_profile()
RETURNS TRIGGER AS $$
DECLARE
    v_current_id UUID;
    v_p_id UUID;
    v_p_side TEXT;
BEGIN
    v_current_id := NEW.id;
    
    LOOP
        SELECT parent_id, side INTO v_p_id, v_p_side FROM profiles WHERE id = v_current_id;
        EXIT WHEN v_p_id IS NULL;

        IF v_p_side = 'LEFT' THEN
            UPDATE profiles 
            SET left_count = COALESCE(left_count, 0) + 1,
                team_size = jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), '{left}', (COALESCE((team_size->>'left')::int, 0) + 1)::text::jsonb)
            WHERE id = v_p_id;
        ELSE
            UPDATE profiles 
            SET right_count = COALESCE(right_count, 0) + 1,
                team_size = jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), '{right}', (COALESCE((team_size->>'right')::int, 0) + 1)::text::jsonb)
            WHERE id = v_p_id;
        END IF;

        v_current_id := v_p_id;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach Triggers
DROP TRIGGER IF EXISTS trg_process_purchase ON purchases;
CREATE TRIGGER trg_process_purchase
AFTER INSERT ON purchases
FOR EACH ROW EXECUTE FUNCTION process_purchase_mlm();

DROP TRIGGER IF EXISTS trg_process_new_profile ON profiles;
CREATE TRIGGER trg_process_new_profile
AFTER INSERT ON profiles
FOR EACH ROW 
WHEN (NEW.role = 'user') -- Only for real users, not sub-nodes (sub-nodes handled in purchase trigger)
EXECUTE FUNCTION process_new_profile();

-- 6. Disable conflicting triggers
-- List of known triggers to disable to prevent double counting
DO $$ 
BEGIN 
    -- Disable old binary triggers if they exist
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_binary_trigger') THEN
        ALTER TABLE profiles DISABLE TRIGGER profiles_binary_trigger;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_matching') THEN
        ALTER TABLE profiles DISABLE TRIGGER trg_matching;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_referral') THEN
        ALTER TABLE profiles DISABLE TRIGGER trg_referral;
    END IF;
END $$;
