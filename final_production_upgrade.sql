-- FINAL PRODUCTION UPGRADE SCRIPT
-- This script consolidates all critical fixes for a production-ready web app.
-- It handles schema updates, RPC functions, and automated triggers for income and network growth.

-- 1. SCHEMA UPDATES (Idempotent)
DO $$ 
BEGIN 
    -- Profiles table enhancements
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallet_balance') THEN
        ALTER TABLE public.profiles ADD COLUMN wallet_balance NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_income') THEN
        ALTER TABLE public.profiles ADD COLUMN total_income NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_income') THEN
        ALTER TABLE public.profiles ADD COLUMN referral_income NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'matching_income') THEN
        ALTER TABLE public.profiles ADD COLUMN matching_income NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'active_package') THEN
        ALTER TABLE public.profiles ADD COLUMN active_package NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'rank') THEN
        ALTER TABLE public.profiles ADD COLUMN rank INT DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallets') THEN
        ALTER TABLE public.profiles ADD COLUMN wallets JSONB DEFAULT '{"master": {"balance": 0, "currency": "USDT"}, "referral": {"balance": 0, "currency": "USDT"}, "matching": {"balance": 0, "currency": "USDT"}, "rankBonus": {"balance": 0, "currency": "USDT"}, "incentive": {"balance": 0, "currency": "USDT"}, "rewards": {"balance": 0, "currency": "USDT"}}'::JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'team_size') THEN
        ALTER TABLE public.profiles ADD COLUMN team_size JSONB DEFAULT '{"left": 0, "right": 0}'::JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'matching_volume') THEN
        ALTER TABLE public.profiles ADD COLUMN matching_volume JSONB DEFAULT '{"left": 0, "right": 0}'::JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'cumulative_volume') THEN
        ALTER TABLE public.profiles ADD COLUMN cumulative_volume JSONB DEFAULT '{"left": 0, "right": 0}'::JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'daily_income') THEN
        ALTER TABLE public.profiles ADD COLUMN daily_income JSONB DEFAULT '{"date": "", "amount": 0}'::JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'operator_id') THEN
        ALTER TABLE public.profiles ADD COLUMN operator_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'real_email') THEN
        ALTER TABLE public.profiles ADD COLUMN real_email TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'status') THEN
        ALTER TABLE public.profiles ADD COLUMN status TEXT DEFAULT 'pending';
    END IF;

    -- Payments table enhancements
-- Ensure payments table has all necessary columns
DO $$ 
BEGIN 
    -- Unify column names
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'uid') THEN
        ALTER TABLE public.payments RENAME COLUMN uid TO user_id;
    END IF;

    -- Ensure user_id is UUID type
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'user_id' AND data_type = 'text') THEN
        ALTER TABLE public.payments ALTER COLUMN user_id TYPE UUID USING user_id::UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'description') THEN
        ALTER TABLE public.payments ADD COLUMN description TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'wallet_type') THEN
        ALTER TABLE public.payments ADD COLUMN wallet_type TEXT DEFAULT 'master';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'order_description') THEN
        ALTER TABLE public.payments ADD COLUMN order_description TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'currency') THEN
        ALTER TABLE public.payments ADD COLUMN currency TEXT DEFAULT 'usdtbsc';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'payment_id') THEN
        ALTER TABLE public.payments ADD COLUMN payment_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'type') THEN
        ALTER TABLE public.payments ADD COLUMN type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'status') THEN
        ALTER TABLE public.payments ADD COLUMN status TEXT DEFAULT 'waiting';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'method') THEN
        ALTER TABLE public.payments ADD COLUMN method TEXT DEFAULT 'INTERNAL';
    END IF;
END $$;

-- Ensure transactions table exists
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Ensure notifications table exists
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'update',
    is_new BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. CORE FUNCTIONS

-- Function to check and update user rank
CREATE OR REPLACE FUNCTION public.check_and_update_rank(p_uid UUID)
RETURNS VOID AS $$
DECLARE
    v_left_size INT;
    v_right_size INT;
    v_new_rank INT := 1;
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_uid;
    
    -- Only active users with at least $50 package qualify for ranks
    IF v_profile.active_package < 50 THEN
        RETURN;
    END IF;

    v_left_size := (COALESCE(v_profile.team_size->>'left', '0'))::int;
    v_right_size := (COALESCE(v_profile.team_size->>'right', '0'))::int;
    
    -- Rank criteria based on team size (pairs)
    IF v_left_size >= 70000 AND v_right_size >= 70000 THEN v_new_rank := 13;
    ELSIF v_left_size >= 30000 AND v_right_size >= 30000 THEN v_new_rank := 12;
    ELSIF v_left_size >= 15000 AND v_right_size >= 15000 THEN v_new_rank := 11;
    ELSIF v_left_size >= 7000 AND v_right_size >= 7000 THEN v_new_rank := 10;
    ELSIF v_left_size >= 3000 AND v_right_size >= 3000 THEN v_new_rank := 9;
    ELSIF v_left_size >= 1500 AND v_right_size >= 1500 THEN v_new_rank := 8;
    ELSIF v_left_size >= 700 AND v_right_size >= 700 THEN v_new_rank := 7;
    ELSIF v_left_size >= 300 AND v_right_size >= 300 THEN v_new_rank := 6;
    ELSIF v_left_size >= 150 AND v_right_size >= 150 THEN v_new_rank := 5;
    ELSIF v_left_size >= 70 AND v_right_size >= 70 THEN v_new_rank := 4;
    ELSIF v_left_size >= 30 AND v_right_size >= 30 THEN v_new_rank := 3;
    ELSIF v_left_size >= 10 AND v_right_size >= 10 THEN v_new_rank := 2;
    END IF;

    IF v_new_rank > v_profile.rank THEN
        UPDATE public.profiles SET rank = v_new_rank WHERE id = p_uid;
        
        -- Create notification for rank up
        INSERT INTO public.notifications (user_id, title, message, type)
        VALUES (p_uid, 'Rank Upgraded!', 'Congratulations! You have reached Rank ' || v_new_rank, 'reward');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate binary matching
CREATE OR REPLACE FUNCTION public.calculate_binary_matching(p_uid UUID)
RETURNS VOID AS $$
DECLARE
    v_left_vol NUMERIC;
    v_right_vol NUMERIC;
    v_pairs_to_match INT;
    v_matching_bonus NUMERIC;
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_uid;
    
    -- Only active users with at least $50 package qualify for matching
    IF v_profile.active_package < 50 THEN
        RETURN;
    END IF;

    v_left_vol := (COALESCE(v_profile.matching_volume->>'left', '0'))::numeric;
    v_right_vol := (COALESCE(v_profile.matching_volume->>'right', '0'))::numeric;
    
    -- 1:1 Matching (1 unit = $50)
    v_pairs_to_match := LEAST(FLOOR(v_left_vol), FLOOR(v_right_vol));
    
    IF v_pairs_to_match > 0 THEN
        v_matching_bonus := v_pairs_to_match * 5; -- $5 per pair (10% of $50)
        
        -- Deduct matched volume
        UPDATE public.profiles
        SET matching_volume = jsonb_build_object(
            'left', v_left_vol - v_pairs_to_match,
            'right', v_right_vol - v_pairs_to_match
        )
        WHERE id = p_uid;
        
        -- Award bonus via RPC to trigger wallet updates
        PERFORM public.admin_add_payment_rpc(
            p_uid::text,
            v_matching_bonus::text,
            'matching_bonus',
            'INTERNAL',
            'Binary Matching Bonus (' || v_pairs_to_match || ' pairs)',
            'finished',
            NULL,
            'usdtbsc',
            'Matching bonus credited'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update ancestors team size and volume
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
            -- Calculate difference in units ($50 = 1 unit)
            IF COALESCE(OLD.active_package, 0) < 50 THEN
                volume_to_add := NEW.active_package / 50;
            ELSE
                volume_to_add := (NEW.active_package - OLD.active_package) / 50;
            END IF;
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
        WHERE id = current_parent_id;

        -- Trigger matching and rank check for this parent if volume was added
        IF volume_to_add > 0 THEN
            PERFORM public.calculate_binary_matching(current_parent_id);
            PERFORM public.check_and_update_rank(current_parent_id);
        END IF;

        -- Move up to the next parent
        SELECT parent_id, side INTO current_parent_id, current_side
        FROM public.profiles
        WHERE id = current_parent_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. TRIGGERS

-- Trigger for wallet updates on payment
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_type TEXT;
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Determine wallet type and operation
    v_wallet_type := COALESCE(NEW.wallet_type, 'master');
    
    -- 1. Update the specific wallet in JSONB
    UPDATE public.profiles
    SET wallets = jsonb_set(
        COALESCE(wallets, '{}'::jsonb),
        ARRAY[v_wallet_type, 'balance'],
        to_jsonb(
            (COALESCE((wallets->v_wallet_type->>'balance')::numeric, 0) + 
            CASE 
                WHEN NEW.type IN ('withdrawal', 'package_activation') THEN -NEW.amount 
                ELSE NEW.amount 
            END)
        )
    )
    WHERE id = NEW.user_id;

    -- 2. Update flat wallet_balance (Master Wallet)
    IF v_wallet_type = 'master' THEN
        UPDATE public.profiles
        SET wallet_balance = wallet_balance + 
            CASE 
                WHEN NEW.type IN ('withdrawal', 'package_activation') THEN -NEW.amount 
                ELSE NEW.amount 
            END
        WHERE id = NEW.user_id;
    END IF;

    -- 3. Update total income and specific income fields
    IF NEW.type NOT IN ('deposit', 'withdrawal', 'package_activation') THEN
        UPDATE public.profiles
        SET 
            total_income = total_income + NEW.amount,
            referral_income = CASE WHEN NEW.type = 'referral_bonus' THEN referral_income + NEW.amount ELSE referral_income END,
            matching_income = CASE WHEN NEW.type = 'matching_bonus' THEN matching_income + NEW.amount ELSE matching_income END
        WHERE id = NEW.user_id;
    END IF;

    -- 4. Log to transactions table
    INSERT INTO public.transactions (user_id, amount, type, description, status)
    VALUES (NEW.user_id, NEW.amount, NEW.type, NEW.description, 'completed');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for package activation
CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    v_sponsor_id UUID;
    v_sponsor_package NUMERIC;
    v_referral_bonus NUMERIC;
BEGIN
    -- Only process finished package activations
    IF NEW.type != 'package_activation' OR NEW.status != 'finished' THEN
        RETURN NEW;
    END IF;

    -- Update user's profile
    UPDATE public.profiles
    SET 
        active_package = NEW.amount,
        status = 'active'
    WHERE id = NEW.user_id;

    -- Award 10% Direct Referral Bonus if sponsor is eligible
    SELECT sponsor_id INTO v_sponsor_id FROM public.profiles WHERE id = NEW.user_id;
    
    IF v_sponsor_id IS NOT NULL THEN
        SELECT active_package INTO v_sponsor_package FROM public.profiles WHERE id = v_sponsor_id;
        
        -- Sponsor must have at least $50 package to earn referral bonus
        IF COALESCE(v_sponsor_package, 0) >= 50 THEN
            v_referral_bonus := NEW.amount * 0.10;
            
            PERFORM public.admin_add_payment_rpc(
                v_sponsor_id::text,
                v_referral_bonus::text,
                'referral_bonus',
                'INTERNAL',
                'Direct Referral Bonus from ' || NEW.user_id,
                'finished',
                NULL,
                'usdtbsc',
                'Referral bonus credited'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for notifications
CREATE OR REPLACE FUNCTION public.on_payment_notification_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'finished' THEN
        INSERT INTO public.notifications (user_id, title, message, type)
        VALUES (
            NEW.user_id,
            CASE 
                WHEN NEW.type = 'deposit' THEN 'Deposit Successful'
                WHEN NEW.type = 'withdrawal' THEN 'Withdrawal Processed'
                WHEN NEW.type = 'referral_bonus' THEN 'Referral Bonus Received'
                WHEN NEW.type = 'matching_bonus' THEN 'Matching Bonus Received'
                WHEN NEW.type = 'package_activation' THEN 'Package Activated'
                ELSE 'Account Update'
            END,
            COALESCE(NEW.description, 'Your account has been updated.'),
            CASE 
                WHEN NEW.type IN ('referral_bonus', 'matching_bonus') THEN 'reward'
                WHEN NEW.type = 'deposit' THEN 'update'
                ELSE 'alert'
            END
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ATTACH TRIGGERS (Drop first to avoid duplicates)

DROP TRIGGER IF EXISTS tr_update_wallets_on_payment ON public.payments;
CREATE TRIGGER tr_update_wallets_on_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();

DROP TRIGGER IF EXISTS tr_process_package_activation ON public.payments;
CREATE TRIGGER tr_process_package_activation
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.process_package_activation();

DROP TRIGGER IF EXISTS tr_on_payment_notification ON public.payments;
CREATE TRIGGER tr_on_payment_notification
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.on_payment_notification_trigger();

DROP TRIGGER IF EXISTS tr_update_ancestors_team_size ON public.profiles;
CREATE TRIGGER tr_update_ancestors_team_size
AFTER INSERT OR UPDATE OF active_package, parent_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size();

-- 5. RPC FUNCTIONS

-- Comprehensive RPC for adding payments/income
-- Using TEXT for all inputs to ensure maximum compatibility with JS/PostgREST
CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid TEXT,
    p_amount TEXT,
    p_type TEXT,
    p_method TEXT DEFAULT 'INTERNAL',
    p_description TEXT DEFAULT '',
    p_status TEXT DEFAULT 'finished',
    p_payment_id TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'usdtbsc',
    p_order_id TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_amount NUMERIC;
BEGIN
    -- Explicit casting to avoid "uuid = text" errors
    v_user_id := p_uid::UUID;
    v_amount := p_amount::NUMERIC;

    INSERT INTO public.payments (
        user_id, amount, type, payment_id, description, status, currency, wallet_type, order_description, method
    ) VALUES (
        v_user_id, v_amount, p_type, p_payment_id, p_description, p_status, p_currency, 
        CASE 
            WHEN p_type = 'referral_bonus' THEN 'referral'
            WHEN p_type = 'matching_bonus' THEN 'matching'
            WHEN p_type = 'rank_reward' THEN 'rewards'
            WHEN p_type = 'incentive_accrual' THEN 'incentive'
            WHEN p_type = 'team_collection' THEN 'referral'
            ELSE 'master'
        END, 
        p_order_id,
        p_method
    );

    RETURN json_build_object('success', true, 'message', 'Payment recorded successfully');
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simplified RPC for adding funds
CREATE OR REPLACE FUNCTION public.admin_add_funds(
    p_user_id TEXT,
    p_amount TEXT
)
RETURNS JSON AS $$
BEGIN
    RETURN public.admin_add_payment_rpc(
        p_user_id,
        p_amount,
        'deposit',
        'ADMIN',
        'Funds added by administrator',
        'finished',
        'ADMIN_CREDIT',
        'usdtbsc',
        'Admin Credit'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
