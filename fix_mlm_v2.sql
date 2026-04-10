
-- 1. Rank Breakdown Function
CREATE OR REPLACE FUNCTION get_rank_breakdown(p_root_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_left_counts JSONB := '{}';
    v_right_counts JSONB := '{}';
    v_left_root UUID;
    v_right_root UUID;
BEGIN
    -- Get direct children
    SELECT id INTO v_left_root FROM profiles WHERE parent_id = p_root_id AND side = 'LEFT';
    SELECT id INTO v_right_root FROM profiles WHERE parent_id = p_root_id AND side = 'RIGHT';

    -- Calculate left breakdown
    IF v_left_root IS NOT NULL THEN
        SELECT jsonb_object_agg(rank_name, count) INTO v_left_counts
        FROM (
            SELECT rank::text as rank_name, count(*) as count
            FROM get_binary_downline(v_left_root)
            GROUP BY rank
        ) s;
    END IF;

    -- Calculate right breakdown
    IF v_right_root IS NOT NULL THEN
        SELECT jsonb_object_agg(rank_name, count) INTO v_right_counts
        FROM (
            SELECT rank::text as rank_name, count(*) as count
            FROM get_binary_downline(v_right_root)
            GROUP BY rank
        ) s;
    END IF;

    RETURN jsonb_build_object(
        'left', COALESCE(v_left_counts, '{}'::jsonb),
        'right', COALESCE(v_right_counts, '{}'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Team Collection Table Fix
CREATE TABLE IF NOT EXISTS team_collection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID REFERENCES profiles(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    name TEXT,
    balance NUMERIC DEFAULT 0,
    eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure uid column exists (if table already existed)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'team_collection'::regclass AND attname = 'uid') THEN
        ALTER TABLE team_collection ADD COLUMN uid UUID REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Matching Income Fix (ensure matched_pairs and matching_volume exist)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'profiles'::regclass AND attname = 'matched_pairs') THEN
        ALTER TABLE profiles ADD COLUMN matched_pairs NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'profiles'::regclass AND attname = 'matching_volume') THEN
        ALTER TABLE profiles ADD COLUMN matching_volume JSONB DEFAULT '{"left": 0, "right": 0}';
    END IF;
END $$;
