-- FINAL TYPE FIX FOR AROWIN MLM SYSTEM
-- This script resolves "uuid = text" errors and return type mismatches in Supabase SQL functions.

-- 1. Update Ancestors Team Size (Fixes UUID casting in loop)
CREATE OR REPLACE FUNCTION public.update_ancestors_team_size()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
    volume_to_add NUMERIC;
    should_increment_team_size BOOLEAN;
BEGIN
    -- Get the parent of the new/updated profile
    SELECT parent_id, side INTO current_parent_id, current_side
    FROM public.profiles
    WHERE id = NEW.id::uuid;

    -- Determine volume to add (e.g., from package activation)
    -- This is usually 0 during registration, and updated later via package activation
    volume_to_add := COALESCE(NEW.active_package, 0) / 50;
    should_increment_team_size := (TG_OP = 'INSERT');

    -- Traverse up the tree
    WHILE current_parent_id IS NOT NULL LOOP
        -- Update the parent's team size and volumes
        UPDATE public.profiles
        SET 
            team_size = CASE 
                WHEN should_increment_team_size THEN
                    jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], to_jsonb((COALESCE(team_size->>lower(current_side), '0'))::int + 1))
                ELSE team_size
            END,
            matching_volume = CASE 
                WHEN volume_to_add > 0 THEN 
                    jsonb_set(COALESCE(matching_volume, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], to_jsonb((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + volume_to_add))
                ELSE matching_volume 
            END,
            cumulative_volume = CASE 
                WHEN volume_to_add > 0 THEN 
                    jsonb_set(COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], to_jsonb((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + volume_to_add))
                ELSE cumulative_volume 
            END
        WHERE id = current_parent_id::uuid;

        -- Trigger matching and rank check for this parent if volume was added
        IF volume_to_add > 0 THEN
            PERFORM public.calculate_binary_matching(current_parent_id::uuid);
            PERFORM public.check_and_update_rank(current_parent_id::uuid);
        END IF;

        -- Move up to the next parent
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = current_parent_id::uuid;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Rebuild Team Sizes (Fixes UUID casting)
CREATE OR REPLACE FUNCTION public.rebuild_team_sizes()
RETURNS VOID AS $$
DECLARE
    p RECORD;
    curr_parent_id UUID;
    curr_side TEXT;
BEGIN
    -- Reset all team sizes
    UPDATE public.profiles SET team_size = '{"left": 0, "right": 0}'::jsonb;

    -- Re-calculate for every user
    FOR p IN SELECT id, parent_id, side FROM public.profiles WHERE parent_id IS NOT NULL LOOP
        curr_parent_id := p.parent_id;
        curr_side := p.side;

        WHILE curr_parent_id IS NOT NULL LOOP
            UPDATE public.profiles
            SET team_size = jsonb_set(
                COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), 
                ARRAY[lower(curr_side)], 
                to_jsonb((COALESCE(team_size->>lower(curr_side), '0'))::int + 1)
            )
            WHERE id = curr_parent_id::uuid;

            SELECT parent_id, side INTO curr_parent_id, curr_side
            FROM public.profiles
            WHERE id = curr_parent_id::uuid;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Get Binary Downline (Fixes return type and UUID casting)
DROP FUNCTION IF EXISTS public.get_binary_downline(UUID);
CREATE OR REPLACE FUNCTION public.get_binary_downline(root_id UUID)
RETURNS TABLE (
    id UUID,
    parent_id UUID,
    side TEXT,
    operator_id TEXT,
    name TEXT,
    rank_name TEXT,
    active_package NUMERIC,
    team_size JSONB,
    matching_volume JSONB,
    cumulative_volume JSONB,
    created_at TIMESTAMPTZ,
    email TEXT,
    sponsor_id UUID,
    status TEXT,
    depth INT,
    path TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE downline AS (
        -- Anchor member
        SELECT 
            p.id, 
            p.parent_id, 
            p.side, 
            p.operator_id, 
            p.name, 
            p.rank_name, 
            p.active_package, 
            p.team_size, 
            p.matching_volume, 
            p.cumulative_volume, 
            p.created_at, 
            p.email, 
            p.sponsor_id,
            p.status,
            0 as depth,
            p.id::text as path
        FROM public.profiles p
        WHERE p.id = root_id::uuid
        
        UNION ALL
        
        -- Recursive step
        SELECT 
            p.id, 
            p.parent_id, 
            p.side, 
            p.operator_id, 
            p.name, 
            p.rank_name, 
            p.active_package, 
            p.team_size, 
            p.matching_volume, 
            p.cumulative_volume, 
            p.created_at, 
            p.email, 
            p.sponsor_id,
            p.status,
            d.depth + 1,
            d.path || '->' || p.id::text
        FROM public.profiles p
        JOIN downline d ON p.parent_id = d.id
        WHERE d.depth < 20 -- Safety limit
    )
    SELECT * FROM downline;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Calculate Binary Matching (Ensures UUID casting)
CREATE OR REPLACE FUNCTION public.calculate_binary_matching(user_id UUID)
RETURNS VOID AS $$
DECLARE
    u_left_vol NUMERIC;
    u_right_vol NUMERIC;
    match_amount NUMERIC;
    dollars_per_unit NUMERIC;
    bonus_amount NUMERIC;
    current_rank INTEGER;
    daily_cap NUMERIC;
    today_income NUMERIC;
    today_date TEXT := TO_CHAR(NOW(), 'YYYY-MM-DD');
    u_active_pkg NUMERIC;
    u_matched_pairs INTEGER;
BEGIN
    -- Get current volumes, wallets, and rank for capping
    SELECT 
        (COALESCE(matching_volume->>'left', '0'))::numeric, 
        (COALESCE(matching_volume->>'right', '0'))::numeric, 
        rank, 
        (COALESCE(daily_income->>'amount', '0'))::numeric, 
        COALESCE(daily_income->>'date', TO_CHAR(NOW(), 'YYYY-MM-DD')),
        active_package,
        COALESCE(matched_pairs, 0)
    INTO u_left_vol, u_right_vol, current_rank, today_income, today_date, u_active_pkg, u_matched_pairs
    FROM public.profiles
    WHERE id = user_id::uuid;

    -- Binary matching only activates if package is $50 or more
    IF u_active_pkg IS NULL OR u_active_pkg < 50 THEN
        RETURN;
    END IF;

    -- Calculate matching amount (in units of $50)
    match_amount := LEAST(u_left_vol, u_right_vol);

    IF match_amount >= 1 THEN
        -- 2:1 or 1:2 logic for the VERY FIRST pair
        IF u_matched_pairs = 0 THEN
            IF (u_left_vol >= 2 AND u_right_vol >= 1) OR (u_left_vol >= 1 AND u_right_vol >= 2) THEN
                match_amount := 1;
            ELSE
                RETURN;
            END IF;
        END IF;

        -- Determine pair income and daily cap based on rank
        CASE 
            WHEN current_rank = 1 THEN dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 2 THEN dollars_per_unit := 5.0; daily_cap := 500;
            WHEN current_rank = 3 THEN dollars_per_unit := 5.0; daily_cap := 1000;
            WHEN current_rank = 4 THEN dollars_per_unit := 5.0; daily_cap := 1500;
            WHEN current_rank = 5 THEN dollars_per_unit := 5.0; daily_cap := 2000;
            WHEN current_rank = 6 THEN dollars_per_unit := 5.0; daily_cap := 2500;
            WHEN current_rank = 7 THEN dollars_per_unit := 5.0; daily_cap := 3000;
            WHEN current_rank = 8 THEN dollars_per_unit := 5.0; daily_cap := 4000;
            WHEN current_rank = 9 THEN dollars_per_unit := 5.0; daily_cap := 5000;
            ELSE dollars_per_unit := 5.0; daily_cap := 250;
        END CASE;

        bonus_amount := match_amount * dollars_per_unit;

        -- Check daily cap
        IF today_date = TO_CHAR(NOW(), 'YYYY-MM-DD') THEN
            IF today_income + bonus_amount > daily_cap THEN
                bonus_amount := GREATEST(0, daily_cap - today_income);
            END IF;
        ELSE
            today_income := 0;
            IF bonus_amount > daily_cap THEN
                bonus_amount := daily_cap;
            END IF;
        END IF;

        IF bonus_amount > 0 THEN
            -- Update matching volumes (subtract matched units)
            UPDATE public.profiles
            SET matching_volume = jsonb_set(
                    jsonb_set(matching_volume, '{left}', ((u_left_vol - match_amount)::text)::jsonb),
                    '{right}', ((u_right_vol - match_amount)::text)::jsonb
                ),
                matched_pairs = COALESCE(matched_pairs, 0) + match_amount,
                daily_income = jsonb_build_object('amount', today_income + bonus_amount, 'date', TO_CHAR(NOW(), 'YYYY-MM-DD'))
            WHERE id = user_id::uuid;

            -- Update wallet and record payment
            PERFORM public.update_user_wallet(
                user_id::uuid, 
                'matching', 
                bonus_amount, 
                'binary_matching', 
                'Binary matching bonus for ' || match_amount || ' pairs'
            );
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Rebuild Cumulative Volume (Fixes UUID casting)
CREATE OR REPLACE FUNCTION public.rebuild_cumulative_volume()
RETURNS VOID AS $$
DECLARE
    p RECORD;
    current_parent_id UUID;
    current_side TEXT;
    v_package_amount NUMERIC;
BEGIN
    -- 1. Rebuild team sizes first
    PERFORM public.rebuild_team_sizes();

    -- 2. Reset all volumes and ranks
    UPDATE public.profiles
    SET matching_volume = '{"left": 0, "right": 0}'::jsonb,
        cumulative_volume = '{"left": 0, "right": 0}'::jsonb,
        rank = 0,
        rank_name = 'New Partner',
        active_package = 0,
        package_amount = 0,
        status = 'inactive';

    -- 3. Re-process every finished package activation
    FOR p in 
        SELECT * FROM public.payments 
        WHERE type = 'package_activation' 
        AND (status = 'finished' OR status = 'completed')
        ORDER BY created_at ASC
    LOOP
        v_package_amount := p.amount;

        -- Update user status
        UPDATE public.profiles
        SET active_package = v_package_amount,
            package_amount = v_package_amount,
            status = CASE WHEN v_package_amount >= 50 THEN 'active' ELSE 'inactive' END
        WHERE id = p.uid::uuid;

        -- Traverse up to update ancestors
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = p.uid::uuid;

        WHILE current_parent_id IS NOT NULL LOOP
            IF UPPER(current_side) IN ('LEFT', 'RIGHT') THEN
                UPDATE public.profiles
                SET matching_volume = jsonb_set(
                        COALESCE(matching_volume, '{"left": 0, "right": 0}'::jsonb), 
                        ARRAY[lower(current_side)], 
                        to_jsonb((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + (v_package_amount / 50))
                    ),
                    cumulative_volume = jsonb_set(
                        COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), 
                        ARRAY[lower(current_side)], 
                        to_jsonb((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + (v_package_amount / 50))
                    )
                WHERE id = current_parent_id::uuid;
            END IF;

            SELECT parent_id, side INTO current_parent_id, current_side
            FROM public.profiles
            WHERE id = current_parent_id::uuid;
        END LOOP;
    END LOOP;

    -- 4. Finally, re-check ranks for everyone
    FOR p IN SELECT id FROM public.profiles LOOP
        PERFORM public.check_and_update_rank(p.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
