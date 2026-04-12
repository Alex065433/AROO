-- ===============================================================
-- BINARY TREE CORE FUNCTIONS (EXTREME PLACEMENT VERSION)
-- ===============================================================

-- 1. Ensure Unique Placement
-- This prevents two users from occupying the same spot in the binary tree.
-- This is the "One Parent Two Child" rule which is essential for a binary structure.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_binary_placement 
ON profiles (parent_id, side) 
WHERE parent_id IS NOT NULL;

-- 2. Recursive function to get binary downline
CREATE OR REPLACE FUNCTION get_binary_downline(root_id UUID)
RETURNS SETOF profiles AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE downline AS (
        SELECT * FROM profiles WHERE id = root_id
        UNION ALL
        SELECT p.* FROM profiles p
        INNER JOIN downline d ON p.parent_id = d.id
    )
    SELECT * FROM downline;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Extreme Placement Function (SQL Version)
-- Finds the very bottom node on the specified side.
-- This implements "No Spillover" (no filling gaps) and "Unlimited Layers".
CREATE OR REPLACE FUNCTION find_binary_parent_extreme(p_start_node_id UUID, p_side TEXT)
RETURNS TABLE(parent_id UUID, side TEXT) AS $$
DECLARE
    v_current_id UUID;
    v_next_id UUID;
    v_depth INT := 0;
BEGIN
    v_current_id := p_start_node_id;
    
    LOOP
        SELECT id INTO v_next_id 
        FROM profiles 
        WHERE profiles.parent_id = v_current_id AND profiles.side = p_side;
        
        IF v_next_id IS NULL OR v_depth > 1000 THEN
            RETURN QUERY SELECT v_current_id, p_side;
            RETURN;
        END IF;
        
        v_current_id := v_next_id;
        v_depth := v_depth + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to update binary counts and business up the tree
CREATE OR REPLACE FUNCTION update_binary_count(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_current_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_package_amount NUMERIC;
BEGIN
    SELECT COALESCE(active_package, package_amount, 0) INTO v_package_amount 
    FROM profiles WHERE id = p_user_id;

    v_current_id := p_user_id;
    
    LOOP
        SELECT profiles.parent_id, profiles.side INTO v_parent_id, v_side FROM profiles WHERE id = v_current_id;
        EXIT WHEN v_parent_id IS NULL;

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

        v_current_id := v_parent_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Rebuild all stats
CREATE OR REPLACE FUNCTION rebuild_binary_stats()
RETURNS VOID AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE profiles 
    SET left_count = 0, 
        right_count = 0, 
        left_business = 0, 
        right_business = 0,
        left_volume = 0,
        right_volume = 0;

    FOR r IN SELECT id FROM profiles LOOP
        PERFORM update_binary_count(r.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
