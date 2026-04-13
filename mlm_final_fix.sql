
-- Final MLM Fix Script
-- Ensures all necessary columns exist and are correctly typed

DO $$ 
BEGIN 
    -- 1. Ensure left_volume and right_volume exist for unmatched balance
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'left_volume') THEN
        ALTER TABLE profiles ADD COLUMN left_volume NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'right_volume') THEN
        ALTER TABLE profiles ADD COLUMN right_volume NUMERIC DEFAULT 0;
    END IF;

    -- 2. Ensure business columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'left_business') THEN
        ALTER TABLE profiles ADD COLUMN left_business NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'right_business') THEN
        ALTER TABLE profiles ADD COLUMN right_business NUMERIC DEFAULT 0;
    END IF;

    -- 3. Ensure count columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'left_count') THEN
        ALTER TABLE profiles ADD COLUMN left_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'right_count') THEN
        ALTER TABLE profiles ADD COLUMN right_count INTEGER DEFAULT 0;
    END IF;

    -- 4. Ensure matched_pairs exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'matched_pairs') THEN
        ALTER TABLE profiles ADD COLUMN matched_pairs NUMERIC DEFAULT 0;
    END IF;

    -- 5. Ensure income columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_income') THEN
        ALTER TABLE profiles ADD COLUMN referral_income NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'matching_income') THEN
        ALTER TABLE profiles ADD COLUMN matching_income NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_income') THEN
        ALTER TABLE profiles ADD COLUMN total_income NUMERIC DEFAULT 0;
    END IF;
END $$;

-- Update the update_binary_count function to be simpler and only handle counts
-- Business and Matching are handled by the TypeScript logic during activation
CREATE OR REPLACE FUNCTION update_binary_count(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_current_id UUID;
    v_parent_id UUID;
    v_side TEXT;
BEGIN
    v_current_id := p_user_id;
    
    LOOP
        -- Get parent and side
        SELECT parent_id, side INTO v_parent_id, v_side FROM profiles WHERE id = v_current_id;
        EXIT WHEN v_parent_id IS NULL;

        -- Update parent's counts
        IF v_side = 'LEFT' THEN
            UPDATE profiles 
            SET left_count = COALESCE(left_count, 0) + 1
            WHERE id = v_parent_id;
        ELSE
            UPDATE profiles 
            SET right_count = COALESCE(right_count, 0) + 1
            WHERE id = v_parent_id;
        END IF;

        -- Move up
        v_current_id := v_parent_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recursive function to get binary downline (for team collection)
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
