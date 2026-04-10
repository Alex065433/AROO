
-- Function to create a sub-node profile (bypassing RLS)
CREATE OR REPLACE FUNCTION create_sub_node(
    p_id UUID,
    p_email TEXT,
    p_operator_id TEXT,
    p_name TEXT,
    p_sponsor_id UUID,
    p_parent_id UUID,
    p_side TEXT,
    p_active_package NUMERIC,
    p_package_amount NUMERIC,
    p_wallets JSONB
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO profiles (
        id, email, operator_id, name, sponsor_id, parent_id, side, 
        status, role, active_package, package_amount, wallets, 
        wallet_balance, total_income, created_at
    ) VALUES (
        p_id, p_email, p_operator_id, p_name, p_sponsor_id, p_parent_id, p_side, 
        'active', 'user', p_active_package, p_package_amount, p_wallets, 
        0, 0, NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update profile counts (bypassing RLS)
CREATE OR REPLACE FUNCTION update_profile_counts(
    p_id UUID,
    p_left_count INTEGER,
    p_right_count INTEGER,
    p_left_business NUMERIC,
    p_right_business NUMERIC
)
RETURNS VOID AS $$
BEGIN
    UPDATE profiles SET 
        left_count = p_left_count,
        right_count = p_right_count,
        left_business = p_left_business,
        right_business = p_right_business,
        team_size = jsonb_build_object('left', p_left_count, 'right', p_right_count)
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
