-- Binary MLM Supabase Schema
-- Run this in your Supabase SQL Editor

-- 1. Profiles Table (Core User Data)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    operator_id TEXT UNIQUE NOT NULL,
    name TEXT,
    mobile TEXT,
    withdrawal_password TEXT,
    two_factor_pin TEXT DEFAULT '123456',
    sponsor_id UUID REFERENCES public.profiles(id),
    parent_id UUID REFERENCES public.profiles(id),
    side TEXT CHECK (side IN ('LEFT', 'RIGHT', 'ROOT')),
    rank INTEGER DEFAULT 0,
    rank_name TEXT DEFAULT 'New Partner',
    active_package NUMERIC DEFAULT 0,
    package_amount NUMERIC DEFAULT 0,
    total_income NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'inactive',
    wallets JSONB DEFAULT '{
        "master": {"balance": 0, "currency": "USDT"},
        "referral": {"balance": 0, "currency": "USDT"},
        "matching": {"balance": 0, "currency": "USDT"},
        "rankBonus": {"balance": 0, "currency": "USDT"},
        "incentive": {"balance": 0, "currency": "USDT"},
        "rewards": {"balance": 0, "currency": "USDT"}
    }'::jsonb,
    team_size JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb,
    matching_volume JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb,
    cumulative_volume JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb,
    carry_forward JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb,
    daily_income JSONB DEFAULT '{"date": "", "amount": 0}'::jsonb,
    matched_pairs INTEGER DEFAULT 0,
    last_incentive_payout TIMESTAMPTZ,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Payments Table (Transactions)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    payment_id TEXT, -- NOWPayments ID
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'usdtbsc',
    type TEXT NOT NULL, -- 'deposit', 'withdrawal', 'package_activation', 'referral_bonus', etc.
    status TEXT DEFAULT 'waiting', -- 'waiting', 'finished', 'failed', 'partially_paid'
    method TEXT DEFAULT 'CRYPTO',
    order_id TEXT,
    order_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Team Collection Table (Mining/Node Nodes)
CREATE TABLE IF NOT EXISTS public.team_collection (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    node_id TEXT UNIQUE NOT NULL,
    name TEXT,
    balance NUMERIC DEFAULT 0,
    eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Support Tickets
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_profiles_operator_id ON public.profiles(operator_id);
CREATE INDEX IF NOT EXISTS idx_profiles_parent_id ON public.profiles(parent_id);
CREATE INDEX IF NOT EXISTS idx_profiles_sponsor_id ON public.profiles(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_payments_uid ON public.payments(uid);
CREATE INDEX IF NOT EXISTS idx_team_collection_uid ON public.team_collection(uid);

-- 5.1 Unique Constraint for Binary Tree Structure
-- This ensures that a parent can only have one child on the LEFT and one on the RIGHT
-- First, clean up any existing duplicates to avoid error 23505
DO $$ 
BEGIN
    -- Update duplicates to have NULL parent_id and side, keeping only the first one created
    UPDATE public.profiles
    SET parent_id = NULL, side = NULL
    WHERE id IN (
        SELECT id
        FROM (
            SELECT id, 
                   ROW_NUMBER() OVER (PARTITION BY parent_id, side ORDER BY created_at ASC) as row_num
            FROM public.profiles
            WHERE parent_id IS NOT NULL AND side IS NOT NULL
        ) t
        WHERE t.row_num > 1
    );

    -- Now try to add the constraint if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_parent_side') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT unique_parent_side UNIQUE (parent_id, side);
    END IF;
END $$;

-- 6. RLS Policies (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own profile, admins can read all, 
-- and all authenticated users can view basic profile info for tree rendering.
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid()::uuid = id);
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND role = 'admin')
);
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND role = 'admin')
);

-- Payments: Users can view/insert own payments
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid()::uuid = uid);
CREATE POLICY "Users can insert own payments" ON public.payments FOR INSERT WITH CHECK (auth.uid()::uuid = uid);
CREATE POLICY "Users can update own payments" ON public.payments FOR UPDATE USING (auth.uid()::uuid = uid);
CREATE POLICY "Admins can view all payments" ON public.payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND role = 'admin')
);
CREATE POLICY "Admins can insert all payments" ON public.payments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND role = 'admin')
);
CREATE POLICY "Admins can update all payments" ON public.payments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND role = 'admin')
);

-- Team Collection: Users can view own nodes
CREATE POLICY "Users can view own nodes" ON public.team_collection FOR SELECT USING (auth.uid()::uuid = uid);

-- Tickets: Users can view/create own tickets
CREATE POLICY "Users can view own tickets" ON public.tickets FOR SELECT USING (auth.uid()::uuid = uid);
CREATE POLICY "Users can create tickets" ON public.tickets FOR INSERT WITH CHECK (auth.uid()::uuid = uid);

-- 7. Trigger for New User
-- This automatically creates a profile when a user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, operator_id, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    'ARW-' || floor(random() * 900000 + 100000)::text,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.email = 'kethankumar130@gmail.com' THEN 'admin' ELSE 'user' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Uncomment the following lines to enable the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Updated At Trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Binary Tree Logic: Update Ancestors Team Size
CREATE OR REPLACE FUNCTION public.update_ancestors_team_size()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
    volume_to_add NUMERIC := 0;
    should_increment_team_size BOOLEAN := FALSE;
BEGIN
    -- Only proceed if we have a parent and a side
    IF NEW.parent_id IS NULL OR NEW.side IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        should_increment_team_size := TRUE;
        IF NEW.active_package >= 50 THEN
            volume_to_add := NEW.active_package / 50;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Case 1: Initial placement (parent_id/side changed from NULL)
        IF (OLD.parent_id IS NULL OR OLD.side IS NULL) AND (NEW.parent_id IS NOT NULL AND NEW.side IS NOT NULL) THEN
            should_increment_team_size := TRUE;
            IF NEW.active_package >= 50 THEN
                volume_to_add := NEW.active_package / 50;
            END IF;
        -- Case 2: Package activation/upgrade (active_package changed)
        ELSIF (OLD.active_package IS DISTINCT FROM NEW.active_package) AND NEW.active_package >= 50 THEN
            -- Calculate difference in units
            IF COALESCE(OLD.active_package, 0) < 50 THEN
                volume_to_add := NEW.active_package / 50;
            ELSE
                volume_to_add := (NEW.active_package - OLD.active_package) / 50;
            END IF;
        -- Case 3: Move (parent_id or side changed)
        ELSIF (OLD.parent_id IS DISTINCT FROM NEW.parent_id OR OLD.side IS DISTINCT FROM NEW.side) THEN
             -- For now, we don't support moves with automatic volume re-calculation
             -- because it would require decrementing old ancestors.
             RETURN NEW;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    IF volume_to_add <= 0 AND NOT should_increment_team_size THEN
        RETURN NEW;
    END IF;

    current_parent_id := NEW.parent_id;
    current_side := NEW.side;

    WHILE current_parent_id IS NOT NULL LOOP
        -- Update the parent's team size and volume
        UPDATE public.profiles
        SET 
            team_size = CASE 
                WHEN should_increment_team_size THEN
                    jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], ((COALESCE(team_size->>lower(current_side), '0'))::int + 1)::text::jsonb)
                ELSE team_size
            END,
            matching_volume = CASE 
                WHEN volume_to_add > 0 THEN 
                    jsonb_set(COALESCE(matching_volume, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], ((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + volume_to_add)::text::jsonb)
                ELSE matching_volume 
            END,
            cumulative_volume = CASE 
                WHEN volume_to_add > 0 THEN 
                    jsonb_set(COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), ARRAY[lower(current_side)], ((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + volume_to_add)::text::jsonb)
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

CREATE OR REPLACE FUNCTION public.update_ancestors_team_size_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
BEGIN
    current_parent_id := OLD.parent_id;
    current_side := OLD.side;

    WHILE current_parent_id IS NOT NULL LOOP
        -- Update the parent's team size (decrement)
        IF UPPER(current_side) = 'LEFT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), ARRAY['left'], (GREATEST(0, (COALESCE(team_size->>'left', '0'))::int - 1))::text::jsonb)
            WHERE id = current_parent_id::uuid;
        ELSIF UPPER(current_side) = 'RIGHT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(COALESCE(team_size, '{"left": 0, "right": 0}'::jsonb), ARRAY['right'], (GREATEST(0, (COALESCE(team_size->>'right', '0'))::int - 1))::text::jsonb)
            WHERE id = current_parent_id::uuid;
        END IF;

        -- Move up to the next parent
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = current_parent_id::uuid;
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_inserted_update_team_size ON public.profiles;
CREATE TRIGGER on_user_inserted_update_team_size
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size();

DROP TRIGGER IF EXISTS on_user_updated_update_team_size ON public.profiles;
CREATE TRIGGER on_user_updated_update_team_size
  AFTER UPDATE OF parent_id, side, active_package ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size();

DROP TRIGGER IF EXISTS on_user_deleted_update_team_size ON public.profiles;
CREATE TRIGGER on_user_deleted_update_team_size
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size_on_delete();

-- Function to rebuild all team sizes from scratch
CREATE OR REPLACE FUNCTION public.rebuild_team_sizes()
RETURNS VOID AS $$
DECLARE
    p RECORD;
    curr_parent_id UUID;
    curr_side TEXT;
    next_parent_id UUID;
    next_side TEXT;
BEGIN
    -- Reset all counts to 0
    UPDATE public.profiles SET team_size = '{"left": 0, "right": 0}'::jsonb;
    
    -- For each profile, walk up its ancestors and increment the appropriate side
    -- We only count nodes that are fully placed (have parent and side)
    FOR p IN SELECT id, parent_id, side FROM public.profiles WHERE parent_id IS NOT NULL AND side IS NOT NULL LOOP
        curr_parent_id := p.parent_id;
        curr_side := p.side;
        
        WHILE curr_parent_id IS NOT NULL LOOP
            IF UPPER(curr_side) = 'LEFT' THEN
                UPDATE public.profiles
                SET team_size = jsonb_set(team_size, ARRAY['left'], ((COALESCE(team_size->>'left', '0'))::int + 1)::text::jsonb)
                WHERE id = curr_parent_id::uuid;
            ELSIF UPPER(curr_side) = 'RIGHT' THEN
                UPDATE public.profiles
                SET team_size = jsonb_set(team_size, ARRAY['right'], ((COALESCE(team_size->>'right', '0'))::int + 1)::text::jsonb)
                WHERE id = curr_parent_id::uuid;
            END IF;
            
            -- Move up
            SELECT parent_id, side INTO next_parent_id, next_side
            FROM public.profiles
            WHERE id = curr_parent_id::uuid;
            
            curr_parent_id := next_parent_id;
            curr_side := next_side;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Helper Function to Update User Wallet and Log Payment
CREATE OR REPLACE FUNCTION public.update_user_wallet(
    user_id UUID, 
    wallet_key TEXT, 
    amount NUMERIC, 
    p_type TEXT, 
    p_description TEXT
)
RETURNS VOID AS $$
DECLARE
    current_wallets JSONB;
BEGIN
    -- Get current wallets
    SELECT wallets INTO current_wallets FROM public.profiles WHERE id = user_id::uuid;
    
    -- Ensure wallet_key exists in JSONB
    IF current_wallets IS NULL THEN
        current_wallets := '{
            "master": {"balance": 0, "currency": "USDT"},
            "referral": {"balance": 0, "currency": "USDT"},
            "matching": {"balance": 0, "currency": "USDT"},
            "rankBonus": {"balance": 0, "currency": "USDT"},
            "incentive": {"balance": 0, "currency": "USDT"},
            "rewards": {"balance": 0, "currency": "USDT"}
        }'::jsonb;
    END IF;

    IF NOT (current_wallets ? wallet_key) THEN
        current_wallets := jsonb_set(current_wallets, ARRAY[wallet_key], '{"balance": 0, "currency": "USDT"}'::jsonb);
    END IF;

    -- Log the payment - the database trigger will handle wallet and total_income updates
    INSERT INTO public.payments (uid, amount, type, status, order_description)
    VALUES (user_id, amount, p_type, 'finished', p_description);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Binary Income Logic: Volume and Matching
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

    -- CRITICAL: Binary matching only activates if package is $50 or more
    IF u_active_pkg IS NULL OR u_active_pkg < 50 THEN
        RETURN;
    END IF;

    -- Calculate matching amount (in units of $50)
    match_amount := LEAST(u_left_vol, u_right_vol);

    IF match_amount >= 1 THEN -- Minimum 1 pair ($50 unit)
        -- 2:1 or 1:2 logic for the VERY FIRST pair
        IF u_matched_pairs = 0 THEN
            IF (u_left_vol >= 2 AND u_right_vol >= 1) OR (u_left_vol >= 1 AND u_right_vol >= 2) THEN
                -- Eligible for first pair
                match_amount := 1;
            ELSE
                -- Not eligible yet
                RETURN;
            END IF;
        END IF;

        -- Determine pair income and daily cap based on rank (Page 11)
        CASE 
            WHEN current_rank = 1 THEN -- Starter
                dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 2 THEN -- Bronze
                dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 3 THEN -- Silver
                dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 4 THEN -- Gold
                dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 5 THEN -- Platina
                dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 6 THEN -- Diamond
                dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 7 THEN -- Blue Sapphire
                dollars_per_unit := 5.0; daily_cap := 250;
            WHEN current_rank = 8 THEN -- Ruby Elite
                dollars_per_unit := 6.0; daily_cap := 360;
            WHEN current_rank = 9 THEN -- Emerald Crown
                dollars_per_unit := 7.0; daily_cap := 490;
            WHEN current_rank = 10 THEN -- Titanium King
                dollars_per_unit := 8.0; daily_cap := 640;
            WHEN current_rank = 11 THEN -- Royal Legend
                dollars_per_unit := 10.0; daily_cap := 900;
            WHEN current_rank = 12 THEN -- Global Ambassador
                dollars_per_unit := 25.0; daily_cap := 2500;
            ELSE
                dollars_per_unit := 5.0; daily_cap := 250;
        END CASE;

        bonus_amount := match_amount * dollars_per_unit;
        
        IF today_date != TO_CHAR(NOW(), 'YYYY-MM-DD') THEN
            today_income := 0;
        END IF;

        IF today_income < daily_cap THEN
            IF (today_income + bonus_amount) > daily_cap THEN
                bonus_amount := daily_cap - today_income;
            END IF;

            -- Update user's earnings using helper
            PERFORM public.update_user_wallet(
                user_id, 
                'matching', 
                bonus_amount, 
                'matching_bonus', 
                'BINARY MATCHING DIVIDEND for ' || (match_amount * 50) || ' volume (' || match_amount || ' pairs)'
            );

            -- Update daily income and deduct matched volume
            IF u_matched_pairs = 0 THEN
                -- First pair deduction (2:1 or 1:2)
                IF u_left_vol >= 2 AND u_right_vol >= 1 THEN
                    UPDATE public.profiles
                    SET daily_income = jsonb_build_object('date', TO_CHAR(NOW(), 'YYYY-MM-DD'), 'amount', today_income + bonus_amount),
                        matching_volume = jsonb_build_object(
                            'left', u_left_vol - 2,
                            'right', u_right_vol - 1
                        ),
                        matched_pairs = 1
                    WHERE id = user_id::uuid;
                ELSIF u_left_vol >= 1 AND u_right_vol >= 2 THEN
                    UPDATE public.profiles
                    SET daily_income = jsonb_build_object('date', TO_CHAR(NOW(), 'YYYY-MM-DD'), 'amount', today_income + bonus_amount),
                        matching_volume = jsonb_build_object(
                            'left', u_left_vol - 1,
                            'right', u_right_vol - 2
                        ),
                        matched_pairs = 1
                    WHERE id = user_id::uuid;
                END IF;
            ELSE
                -- Subsequent pairs (1:1)
                UPDATE public.profiles
                SET daily_income = jsonb_build_object('date', TO_CHAR(NOW(), 'YYYY-MM-DD'), 'amount', today_income + bonus_amount),
                    matching_volume = jsonb_build_object(
                        'left', u_left_vol - match_amount,
                        'right', u_right_vol - match_amount
                    ),
                    matched_pairs = u_matched_pairs + floor(match_amount)
                WHERE id = user_id::uuid;
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Rank System Logic
CREATE OR REPLACE FUNCTION public.check_and_update_rank(user_id UUID)
RETURNS VOID AS $$
DECLARE
    u_rank INTEGER;
    u_left_vol NUMERIC;
    u_right_vol NUMERIC;
    u_active_pkg NUMERIC;
    new_rank INTEGER;
    reward_amount NUMERIC := 0;
BEGIN
    SELECT rank, (COALESCE(cumulative_volume->>'left', '0'))::numeric, (COALESCE(cumulative_volume->>'right', '0'))::numeric, active_package
    INTO u_rank, u_left_vol, u_right_vol, u_active_pkg
    FROM public.profiles
    WHERE id = user_id::uuid;

    -- CRITICAL: Rank only activates if package is $50 or more
    IF u_active_pkg IS NULL OR u_active_pkg < 50 THEN
        IF u_rank > 0 THEN
            UPDATE public.profiles 
            SET rank = 0, 
                rank_name = 'Inactive',
                status = 'inactive'
            WHERE id = user_id::uuid;
        END IF;
        RETURN;
    END IF;

    new_rank := u_rank;

    -- Rank 1: Starter (Active Account >= 50)
    IF u_rank = 0 AND u_active_pkg >= 50 THEN
        new_rank := 1;
    END IF;

    -- Rank Criteria (matching Page 10)
    IF u_left_vol >= 70000 AND u_right_vol >= 70000 AND u_rank < 12 THEN
        new_rank := 12;
    ELSIF u_left_vol >= 30000 AND u_right_vol >= 30000 AND u_rank < 11 THEN
        new_rank := 11;
    ELSIF u_left_vol >= 15000 AND u_right_vol >= 15000 AND u_rank < 10 THEN
        new_rank := 10;
    ELSIF u_left_vol >= 7000 AND u_right_vol >= 7000 AND u_rank < 9 THEN
        new_rank := 9;
    ELSIF u_left_vol >= 3000 AND u_right_vol >= 3000 AND u_rank < 8 THEN
        new_rank := 8;
    ELSIF u_left_vol >= 1500 AND u_right_vol >= 1500 AND u_rank < 7 THEN
        new_rank := 7;
    ELSIF u_left_vol >= 700 AND u_right_vol >= 700 AND u_rank < 6 THEN
        new_rank := 6;
    ELSIF u_left_vol >= 300 AND u_right_vol >= 300 AND u_rank < 5 THEN
        new_rank := 5;
    ELSIF u_left_vol >= 150 AND u_right_vol >= 150 AND u_rank < 4 THEN
        new_rank := 4;
    ELSIF u_left_vol >= 70 AND u_right_vol >= 70 AND u_rank < 3 THEN
        new_rank := 3;
    ELSIF u_left_vol >= 30 AND u_right_vol >= 30 AND u_rank < 2 THEN
        new_rank := 2;
    END IF;

    IF new_rank > u_rank THEN
        UPDATE public.profiles
        SET rank = new_rank,
            rank_name = CASE 
                WHEN new_rank = 1 THEN 'Starter'
                WHEN new_rank = 2 THEN 'Bronze'
                WHEN new_rank = 3 THEN 'Silver'
                WHEN new_rank = 4 THEN 'Gold'
                WHEN new_rank = 5 THEN 'Platina'
                WHEN new_rank = 6 THEN 'Diamond'
                WHEN new_rank = 7 THEN 'Blue Sapphire'
                WHEN new_rank = 8 THEN 'Ruby Elite'
                WHEN new_rank = 9 THEN 'Emerald Crown'
                WHEN new_rank = 10 THEN 'Titanium King'
                WHEN new_rank = 11 THEN 'Royal Legend'
                WHEN new_rank = 12 THEN 'Global Ambassador'
                ELSE rank_name
            END
        WHERE id = user_id::uuid;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
    v_package_amount NUMERIC;
    v_sponsor_id UUID;
    sponsor_wallets JSONB;
    v_referral_bonus NUMERIC;
BEGIN
    -- Only process if payment is finished and type is package_activation
    -- Handle both INSERT and UPDATE
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND NEW.type = 'package_activation' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        v_package_amount := NEW.amount;

        -- 1. Update the user's own package info and status
        UPDATE public.profiles
        SET active_package = v_package_amount,
            package_amount = v_package_amount,
            status = CASE WHEN v_package_amount >= 50 THEN 'active' ELSE 'inactive' END
        WHERE id = NEW.uid::uuid;

        -- MLM logic (nodes, referral, volume) for ALL packages >= $50
        IF v_package_amount >= 50 THEN
            -- 1.1 Generate Team Collection Nodes (Page 13)
            INSERT INTO public.team_collection (uid, node_id, name, balance, eligible, created_at)
            SELECT 
                NEW.uid::uuid,
                'NODE-' || substring(gen_random_uuid()::text from 1 for 8) || '-' || i,
                'Node ' || i || ' (Package ' || v_package_amount || ')',
                0,
                true,
                NOW()
            FROM generate_series(1, CASE 
                WHEN v_package_amount >= 12750 THEN 255
                WHEN v_package_amount >= 6350 THEN 127
                WHEN v_package_amount >= 3150 THEN 63
                WHEN v_package_amount >= 1550 THEN 31
                WHEN v_package_amount >= 750 THEN 15
                WHEN v_package_amount >= 350 THEN 7
                WHEN v_package_amount >= 150 THEN 3
                ELSE 1
            END) AS i
            ON CONFLICT (node_id) DO NOTHING;

            -- 1.2 INCENTIVE POOL ACCRUAL (1% to the user themselves)
            PERFORM public.update_user_wallet(
                NEW.uid::uuid, 
                'incentive', 
                v_package_amount * 0.01, 
                'incentive_accrual', 
                'INCENTIVE POOL ACCRUAL for Package ' || v_package_amount
            );

            -- Trigger rank check for the user themselves
            PERFORM public.check_and_update_rank(NEW.uid::uuid);

            -- 2. DIRECT REFERRAL YIELD (5% - $2.5 per $50 unit)
            SELECT p.sponsor_id INTO v_sponsor_id FROM public.profiles p WHERE p.id = NEW.uid::uuid;
            
            IF v_sponsor_id IS NOT NULL THEN
                v_referral_bonus := (v_package_amount / 50) * 2.5; -- 5% of package
                
                PERFORM public.update_user_wallet(
                    v_sponsor_id, 
                    'referral', 
                    v_referral_bonus, 
                    'referral_bonus', 
                    'DIRECT REFERRAL YIELD from ' || NEW.uid::text
                );
                
                -- Trigger rank check for sponsor
                PERFORM public.check_and_update_rank(v_sponsor_id);
            END IF;

            -- 3. Volume propagation is now handled by the update_ancestors_team_size trigger 
            -- on the profiles table, which fires when active_package is updated above.
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 15. Process Weekly Incentives (ROI/Weekly Earning)
CREATE OR REPLACE FUNCTION public.process_weekly_incentives()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    incentive_amount NUMERIC;
BEGIN
    FOR r IN 
        SELECT id, rank, last_incentive_payout, active_package
        FROM public.profiles 
        WHERE status = 'active' 
          AND active_package >= 50
          AND (last_incentive_payout IS NULL OR last_incentive_payout < NOW() - INTERVAL '7 days')
    LOOP
        -- Determine weekly incentive based on rank (matching constants.tsx)
        CASE 
            WHEN r.rank = 1 THEN incentive_amount := 4;
            WHEN r.rank = 2 THEN incentive_amount := 6;
            WHEN r.rank = 3 THEN incentive_amount := 10;
            WHEN r.rank = 4 THEN incentive_amount := 16;
            WHEN r.rank = 5 THEN incentive_amount := 31;
            WHEN r.rank = 6 THEN incentive_amount := 50;
            WHEN r.rank = 7 THEN incentive_amount := 125;
            WHEN r.rank = 8 THEN incentive_amount := 250;
            WHEN r.rank = 9 THEN incentive_amount := 500;
            WHEN r.rank = 10 THEN incentive_amount := 1000;
            WHEN r.rank = 11 THEN incentive_amount := 2500;
            WHEN r.rank = 12 THEN incentive_amount := 10000;
            ELSE incentive_amount := 0;
        END CASE;

        IF incentive_amount > 0 THEN
            -- Pay the incentive
            PERFORM public.update_user_wallet(
                r.id, 
                'incentive', 
                incentive_amount, 
                'weekly_incentive', 
                'WEEKLY PROTOCOL INCENTIVE for Rank ' || r.rank
            );

            -- Update last payout date
            UPDATE public.profiles 
            SET last_incentive_payout = NOW() 
            WHERE id = r.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- 15. Update Node Balances (Mining Simulation)
CREATE OR REPLACE FUNCTION public.update_node_balances()
RETURNS VOID AS $$
BEGIN
    -- Each active node generates 0.25 USDT per day (0.5% of $50 unit)
    UPDATE public.team_collection
    SET balance = balance + (0.25 * EXTRACT(EPOCH FROM (NOW() - COALESCE(updated_at, created_at))) / 86400)
    WHERE eligible = TRUE;
    
    -- Update updated_at to NOW()
    UPDATE public.team_collection
    SET updated_at = NOW()
    WHERE eligible = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add updated_at to team_collection if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_collection' AND column_name='updated_at') THEN
        ALTER TABLE public.team_collection ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
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
    FOR p IN 
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
                        ((COALESCE(matching_volume->>lower(current_side), '0'))::numeric + (v_package_amount / 50))::text::jsonb
                    ),
                    cumulative_volume = jsonb_set(
                        COALESCE(cumulative_volume, '{"left": 0, "right": 0}'::jsonb), 
                        ARRAY[lower(current_side)], 
                        ((COALESCE(cumulative_volume->>lower(current_side), '0'))::numeric + (v_package_amount / 50))::text::jsonb
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

CREATE OR REPLACE FUNCTION public.rebuild_network()
RETURNS VOID AS $$
BEGIN
    PERFORM public.rebuild_team_sizes();
    PERFORM public.rebuild_cumulative_volume();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to claim a specific wallet balance to the master vault
CREATE OR REPLACE FUNCTION public.claim_wallet(p_user_id UUID, p_wallet_key TEXT)
RETURNS VOID AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    -- Get current balance of the specific wallet
    SELECT (wallets->p_wallet_key->>'balance')::numeric INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_balance > 0 THEN
        -- Deduct from specific wallet
        UPDATE public.profiles
        SET wallets = jsonb_set(
            wallets,
            ARRAY[p_wallet_key, 'balance'],
            '0'::jsonb
        )
        WHERE id = p_user_id;

        -- Add to master wallet
        UPDATE public.profiles
        SET wallets = jsonb_set(
            wallets,
            ARRAY['master', 'balance'],
            ((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_balance)::text::jsonb
        )
        WHERE id = p_user_id;

        -- Log transaction
        INSERT INTO public.payments (uid, amount, type, status, order_description, created_at)
        VALUES (p_user_id, v_balance, 'claim', 'finished', 'Claimed ' || p_wallet_key || ' to Master Vault', NOW());
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process daily payouts (capping reset and binary matching)
CREATE OR REPLACE FUNCTION public.process_daily_payouts()
RETURNS VOID AS $$
DECLARE
    p RECORD;
BEGIN
    -- 1. Reset daily caps for everyone
    UPDATE public.profiles
    SET daily_income = jsonb_build_object(
        'amount', 0,
        'date', CURRENT_DATE::text
    );

    -- 2. Calculate matching for all active users
    FOR p IN SELECT id FROM public.profiles WHERE active_package >= 50 LOOP
        PERFORM public.calculate_binary_matching(p.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process rank and rewards manually
CREATE OR REPLACE FUNCTION public.process_rank_and_rewards()
RETURNS VOID AS $$
DECLARE
    p RECORD;
BEGIN
    FOR p IN SELECT id FROM public.profiles WHERE active_package >= 50 LOOP
        PERFORM public.check_and_update_rank(p.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Transactions table for income logging
DROP TABLE IF EXISTS public.transactions CASCADE;
CREATE TABLE public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uid UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL, -- referral, matching, rank, incentive, collection
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transactions
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
CREATE POLICY "Users can view their own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid()::uuid = uid);

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions"
    ON public.transactions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()::uuid AND role = 'admin'
        )
    );

CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    current_wallets JSONB;
    wallet_key TEXT;
    new_balance NUMERIC;
BEGIN
    -- Only process if status is finished
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        SELECT wallets INTO current_wallets FROM public.profiles WHERE id = NEW.uid::uuid;
        
        -- Ensure wallets is not null
        current_wallets := COALESCE(current_wallets, '{
            "master": {"balance": 0, "currency": "USDT"},
            "referral": {"balance": 0, "currency": "USDT"},
            "matching": {"balance": 0, "currency": "USDT"},
            "rankBonus": {"balance": 0, "currency": "USDT"},
            "incentive": {"balance": 0, "currency": "USDT"},
            "rewards": {"balance": 0, "currency": "USDT"}
        }'::jsonb);

        -- Determine which wallet to update based on payment type
        wallet_key := CASE 
            WHEN NEW.type IN ('referral_bonus', 'referral_income') THEN 'referral'
            WHEN NEW.type IN ('matching_bonus', 'matching_income') THEN 'matching'
            WHEN NEW.type IN ('rank_reward', 'rank_bonus') THEN 'rankBonus'
            WHEN NEW.type IN ('incentive_accrual', 'weekly_incentive', 'incentive_income') THEN 'incentive'
            WHEN NEW.type IN ('team_collection', 'reward_income', 'node_income') THEN 'rewards'
            WHEN NEW.type = 'deposit' THEN 'master'
            WHEN NEW.type = 'withdrawal' THEN 'master'
            WHEN NEW.type = 'package_activation' THEN 'master'
            ELSE 'master'
        END;

        -- Ensure the specific wallet exists in the JSONB
        IF NOT (current_wallets ? wallet_key) THEN
            current_wallets := jsonb_set(current_wallets, ARRAY[wallet_key], '{"balance": 0, "currency": "USDT"}'::jsonb);
        END IF;

        -- Update the specific wallet and the master wallet (except for deposits/withdrawals which are already master)
        IF wallet_key != 'master' THEN
            UPDATE public.profiles
            SET wallets = jsonb_set(
                    jsonb_set(current_wallets, ARRAY[wallet_key, 'balance'], ((COALESCE(current_wallets->wallet_key->>'balance', '0'))::numeric + NEW.amount)::text::jsonb),
                    ARRAY['master', 'balance'], ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)::text::jsonb
                ),
                total_income = COALESCE(total_income, 0) + CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END
            WHERE id = NEW.uid::uuid;

            -- Log to transactions table
            INSERT INTO public.transactions (uid, amount, type, description)
            VALUES (NEW.uid::uuid, NEW.amount, wallet_key, NEW.order_description || ' (' || NEW.type || ')');
        ELSE
            -- Handle master wallet updates (deposits, withdrawals, package activations)
            new_balance := CASE 
                WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric - NEW.amount)
                WHEN NEW.type = 'deposit' THEN
                    ((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + NEW.amount)
                ELSE 
                    (COALESCE(current_wallets->'master'->>'balance', '0'))::numeric
            END;

            UPDATE public.profiles
            SET wallets = jsonb_set(current_wallets, ARRAY['master', 'balance'], new_balance::text::jsonb)
            WHERE id = NEW.uid::uuid;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 16. Rebuild Wallets from Payments
CREATE OR REPLACE FUNCTION public.rebuild_wallets_from_payments(user_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    profile_record RECORD;
    payment_record RECORD;
    new_wallets JSONB;
    new_total_income NUMERIC;
    wallet_key TEXT;
BEGIN
    -- Loop through profiles (all or specific user)
    FOR profile_record IN 
        SELECT id FROM public.profiles 
        WHERE (user_id IS NULL OR id = user_id)
    LOOP
        -- Initialize empty wallets
        new_wallets := '{
            "master": {"balance": 0, "currency": "USDT"},
            "referral": {"balance": 0, "currency": "USDT"},
            "matching": {"balance": 0, "currency": "USDT"},
            "rankBonus": {"balance": 0, "currency": "USDT"},
            "incentive": {"balance": 0, "currency": "USDT"},
            "rewards": {"balance": 0, "currency": "USDT"}
        }'::jsonb;
        new_total_income := 0;

        -- Process all finished payments for this user
        FOR payment_record IN 
            SELECT amount, type FROM public.payments 
            WHERE uid = profile_record.id AND (status = 'finished' OR status = 'completed')
            ORDER BY created_at ASC
        LOOP
            -- Determine wallet key
            wallet_key := CASE 
                WHEN payment_record.type IN ('referral_bonus', 'referral_income') THEN 'referral'
                WHEN payment_record.type IN ('matching_bonus', 'matching_income') THEN 'matching'
                WHEN payment_record.type IN ('rank_reward', 'rank_bonus') THEN 'rankBonus'
                WHEN payment_record.type IN ('incentive_accrual', 'weekly_incentive', 'incentive_income') THEN 'incentive'
                WHEN payment_record.type IN ('team_collection', 'reward_income', 'node_income') THEN 'rewards'
                WHEN payment_record.type = 'deposit' THEN 'master'
                WHEN payment_record.type = 'withdrawal' THEN 'master'
                WHEN payment_record.type = 'package_activation' THEN 'master'
                ELSE 'master'
            END;

            -- Update wallets
            IF wallet_key = 'master' THEN
                IF payment_record.type = 'withdrawal' OR (payment_record.type = 'package_activation') THEN
                    new_wallets := jsonb_set(new_wallets, ARRAY['master', 'balance'], ((new_wallets->'master'->>'balance')::numeric - payment_record.amount)::text::jsonb);
                ELSE
                    new_wallets := jsonb_set(new_wallets, ARRAY['master', 'balance'], ((new_wallets->'master'->>'balance')::numeric + payment_record.amount)::text::jsonb);
                END IF;
            ELSE
                -- Add to sub-wallet AND master wallet (as per current schema logic where income goes to both)
                new_wallets := jsonb_set(new_wallets, ARRAY[wallet_key, 'balance'], ((new_wallets->wallet_key->>'balance')::numeric + payment_record.amount)::text::jsonb);
                new_wallets := jsonb_set(new_wallets, ARRAY['master', 'balance'], ((new_wallets->'master'->>'balance')::numeric + payment_record.amount)::text::jsonb);
                
                -- Add to total income
                IF payment_record.amount > 0 THEN
                    new_total_income := new_total_income + payment_record.amount;
                END IF;
            END IF;
        END LOOP;

        -- Update the profile
        UPDATE public.profiles 
        SET wallets = new_wallets,
            total_income = new_total_income
        WHERE id = profile_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payment_update_process_package ON public.payments;
CREATE TRIGGER on_payment_update_process_package
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.process_package_activation();

DROP TRIGGER IF EXISTS on_payment_update_wallets ON public.payments;
CREATE TRIGGER on_payment_update_wallets
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();
