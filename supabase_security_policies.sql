
-- Task 4: Row Level Security (RLS) Policies

-- 1. Enable RLS on core tables
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Users can view their own profile/MLM node
CREATE POLICY "Users can view own MLM profile" 
ON members 
FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

-- 3. Policy: Visibility of Downline Tree
-- Note: In enterprise MLM, we often need recursive CTEs for "Downline Access"
-- A simplified path-based or recursive check for tree visibility:
CREATE OR REPLACE FUNCTION is_member_downline(target_uuid UUID, viewer_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Recursive check to see if target_uuid has viewer_uuid in its upline chain
    RETURN EXISTS (
        WITH RECURSIVE downline AS (
            SELECT id, placement_id FROM members WHERE id = viewer_uuid
            UNION ALL
            SELECT m.id, m.placement_id FROM members m 
            JOIN downline d ON m.placement_id = d.id
        )
        SELECT 1 FROM downline WHERE id = target_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can view their downline" 
ON members 
FOR SELECT 
TO authenticated 
USING (is_member_downline(id, auth.uid()));

-- 4. Transactions Policy
CREATE POLICY "Users can view own transactions" 
ON transactions 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);
-- Insert/Update is restricted to Service Role (Edge Functions only)
