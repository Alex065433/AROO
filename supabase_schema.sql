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
    rank INTEGER DEFAULT 1,
    rank_name TEXT DEFAULT 'Partner',
    active_package NUMERIC DEFAULT 0,
    package_amount NUMERIC DEFAULT 0,
    total_income NUMERIC DEFAULT 0,
    wallets JSONB DEFAULT '{
        "master": {"balance": 0, "currency": "USDT"},
        "referral": {"balance": 0, "currency": "USDT"},
        "matching": {"balance": 0, "currency": "USDT"},
        "rankBonus": {"balance": 0, "currency": "USDT"},
        "rewards": {"balance": 0, "currency": "USDT"}
    }'::jsonb,
    team_size JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb,
    matching_volume JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb,
    carry_forward JSONB DEFAULT '{"left": 0, "right": 0}'::jsonb,
    daily_income JSONB DEFAULT '{"date": "", "amount": 0}'::jsonb,
    matched_pairs INTEGER DEFAULT 0,
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

-- 6. RLS Policies (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own profile, admins can read all, 
-- and all authenticated users can view basic profile info for tree rendering.
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Payments: Users can view own payments
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid() = uid);
CREATE POLICY "Admins can view all payments" ON public.payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Team Collection: Users can view own nodes
CREATE POLICY "Users can view own nodes" ON public.team_collection FOR SELECT USING (auth.uid() = uid);

-- Tickets: Users can view/create own tickets
CREATE POLICY "Users can view own tickets" ON public.tickets FOR SELECT USING (auth.uid() = uid);
CREATE POLICY "Users can create tickets" ON public.tickets FOR INSERT WITH CHECK (auth.uid() = uid);

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
    current_child_id UUID;
    current_side TEXT;
BEGIN
    current_parent_id := NEW.parent_id;
    current_child_id := NEW.id;
    current_side := NEW.side;

    WHILE current_parent_id IS NOT NULL LOOP
        -- Update the parent's team size
        IF current_side = 'LEFT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(team_size, '{left}', ((team_size->>'left')::int + 1)::text::jsonb)
            WHERE id = current_parent_id;
        ELSIF current_side = 'RIGHT' THEN
            UPDATE public.profiles
            SET team_size = jsonb_set(team_size, '{right}', ((team_size->>'right')::int + 1)::text::jsonb)
            WHERE id = current_parent_id;
        END IF;

        -- Move up to the next parent
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = current_parent_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_inserted_update_team_size ON public.profiles;
CREATE TRIGGER on_user_inserted_update_team_size
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size();

-- 10. Binary Income Logic: Volume and Matching
CREATE OR REPLACE FUNCTION public.calculate_binary_matching(user_id UUID)
RETURNS VOID AS $$
DECLARE
    u_left_vol NUMERIC;
    u_right_vol NUMERIC;
    match_amount NUMERIC;
    bonus_percent NUMERIC := 0.10; -- 10% matching bonus
    bonus_amount NUMERIC;
    current_wallets JSONB;
BEGIN
    -- Get current volumes and wallets
    SELECT (matching_volume->>'left')::numeric, (matching_volume->>'right')::numeric, wallets
    INTO u_left_vol, u_right_vol, current_wallets
    FROM public.profiles
    WHERE id = user_id;

    -- Calculate matching amount
    match_amount := LEAST(u_left_vol, u_right_vol);

    IF match_amount > 0 THEN
        bonus_amount := match_amount * bonus_percent;

        -- Update user's earnings and wallets
        UPDATE public.profiles
        SET total_income = total_income + bonus_amount,
            wallets = jsonb_set(wallets, '{matching,balance}', ((current_wallets->'matching'->>'balance')::numeric + bonus_amount)::text::jsonb),
            -- Deduct matched volume
            matching_volume = jsonb_build_object(
                'left', u_left_vol - match_amount,
                'right', u_right_vol - match_amount
            ),
            matched_pairs = matched_pairs + 1
        WHERE id = user_id;

        -- Log the bonus payment
        INSERT INTO public.payments (uid, amount, type, status, order_description)
        VALUES (user_id, bonus_amount, 'matching_bonus', 'finished', 'Binary matching bonus for ' || match_amount || ' volume');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    current_parent_id UUID;
    current_side TEXT;
    package_amount NUMERIC;
BEGIN
    -- Only process if payment is finished and type is package_activation
    IF NEW.status = 'finished' AND NEW.type = 'package_activation' AND (OLD.status IS NULL OR OLD.status != 'finished') THEN
        package_amount := NEW.amount;

        -- Update the user's own package info
        UPDATE public.profiles
        SET active_package = package_amount,
            package_amount = package_amount
        WHERE id = NEW.uid;

        -- Traverse up to update ancestors' volume
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = NEW.uid;

        WHILE current_parent_id IS NOT NULL LOOP
            -- Update the parent's matching volume
            IF current_side = 'LEFT' THEN
                UPDATE public.profiles
                SET matching_volume = jsonb_set(matching_volume, '{left}', ((matching_volume->>'left')::numeric + package_amount)::text::jsonb)
                WHERE id = current_parent_id;
            ELSIF current_side = 'RIGHT' THEN
                UPDATE public.profiles
                SET matching_volume = jsonb_set(matching_volume, '{right}', ((matching_volume->>'right')::numeric + package_amount)::text::jsonb)
                WHERE id = current_parent_id;
            END IF;

            -- Trigger binary matching check for this parent
            PERFORM public.calculate_binary_matching(current_parent_id);

            -- Move up to the next parent
            SELECT parent_id, side INTO current_parent_id, current_side
            FROM public.profiles
            WHERE id = current_parent_id;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payment_update_process_package ON public.payments;
CREATE TRIGGER on_payment_update_process_package
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.process_package_activation();
