-- ===============================================================
-- BINARY TREE CORE FUNCTIONS & CONSTRAINTS
-- ===============================================================

-- 1. Ensure Unique Placement
-- This prevents two users from occupying the same spot in the binary tree.
-- We use COALESCE to handle the root node (where parent_id is NULL).
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

-- 3. Recursive function to get binary ancestors
CREATE OR REPLACE FUNCTION get_binary_ancestors(p_user_id UUID)
RETURNS SETOF profiles AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE ancestors AS (
        SELECT * FROM profiles WHERE id = p_user_id
        UNION ALL
        SELECT p.* FROM profiles p
        INNER JOIN ancestors a ON p.id = a.parent_id
    )
    SELECT * FROM ancestors WHERE id != p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. BFS Placement Function (SQL Version)
-- Finds the next available spot in a subtree using Breadth-First Search.
CREATE OR REPLACE FUNCTION find_binary_parent_bfs(p_start_node_id UUID, p_side TEXT)
RETURNS TABLE(parent_id UUID, side TEXT) AS $$
DECLARE
    v_direct_child_id UUID;
    v_queue UUID[];
    v_current_id UUID;
    v_left_child UUID;
    v_right_child UUID;
BEGIN
    -- 1. Check if the direct side is available
    SELECT id INTO v_direct_child_id 
    FROM profiles 
    WHERE profiles.parent_id = p_start_node_id AND profiles.side = p_side
    LIMIT 1; -- Avoid multiple rows error

    IF v_direct_child_id IS NULL THEN
        RETURN QUERY SELECT p_start_node_id, p_side;
        RETURN;
    END IF;

    -- 2. BFS starting from the direct child
    v_queue := ARRAY[v_direct_child_id];
    
    WHILE array_length(v_queue, 1) > 0 LOOP
        v_current_id := v_queue[1];
        v_queue := v_queue[2:array_length(v_queue, 1)]; -- Pop first

        -- Check left
        SELECT id INTO v_left_child FROM profiles WHERE profiles.parent_id = v_current_id AND profiles.side = 'LEFT' LIMIT 1;
        IF v_left_child IS NULL THEN
            RETURN QUERY SELECT v_current_id, 'LEFT'::TEXT;
            RETURN;
        END IF;

        -- Check right
        SELECT id INTO v_right_child FROM profiles WHERE profiles.parent_id = v_current_id AND profiles.side = 'RIGHT' LIMIT 1;
        IF v_right_child IS NULL THEN
            RETURN QUERY SELECT v_current_id, 'RIGHT'::TEXT;
            RETURN;
        END IF;

        -- Add children to queue
        v_queue := array_append(v_queue, v_left_child);
        v_queue := array_append(v_queue, v_right_child);
        
        -- Safety break for very deep trees
        IF array_length(v_queue, 1) > 2000 THEN
            EXIT;
        END IF;
    END LOOP;

    -- Fallback
    RETURN QUERY SELECT p_start_node_id, p_side;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to update binary counts and business up the tree
CREATE OR REPLACE FUNCTION update_binary_count(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_current_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_package_amount NUMERIC;
BEGIN
    -- Get the package amount of the user that triggered the update
    -- We check both active_package and package_amount
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

-- 6. Rebuild all counts (Utility function)
CREATE OR REPLACE FUNCTION rebuild_binary_stats()
RETURNS VOID AS $$
DECLARE
    r RECORD;
BEGIN
    -- Reset all counts
    UPDATE profiles 
    SET left_count = 0, 
        right_count = 0, 
        left_business = 0, 
        right_business = 0,
        left_volume = 0,
        right_volume = 0;

    -- Recalculate for every user
    FOR r IN SELECT id FROM profiles LOOP
        PERFORM update_binary_count(r.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
