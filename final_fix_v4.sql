-- FINAL DEFINITIVE FIX FOR PACKAGE ACTIVATION AND WALLET SYNC
-- This script standardizes column names, fixes triggers, and ensures package activation works.

-- 1. STANDARDIZE SCHEMA (Unify on 'uid' for all tables)
DO $$ 
BEGIN 
    -- Fix payments table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'user_id') THEN
        ALTER TABLE public.payments RENAME COLUMN user_id TO uid;
    END IF;
    
    -- Fix transactions table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'user_id') THEN
        ALTER TABLE public.transactions RENAME COLUMN user_id TO uid;
    END IF;

    -- Fix notifications table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'user_id') THEN
        ALTER TABLE public.notifications RENAME COLUMN user_id TO uid;
    END IF;

    -- Ensure profiles table has all necessary columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallet_balance') THEN
        ALTER TABLE public.profiles ADD COLUMN wallet_balance NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_income') THEN
        ALTER TABLE public.profiles ADD COLUMN total_income NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'active_package') THEN
        ALTER TABLE public.profiles ADD COLUMN active_package NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'status') THEN
        ALTER TABLE public.profiles ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallets') THEN
        ALTER TABLE public.profiles ADD COLUMN wallets JSONB DEFAULT '{"master": {"balance": 0, "currency": "USDT"}, "referral": {"balance": 0, "currency": "USDT"}, "matching": {"balance": 0, "currency": "USDT"}, "rankBonus": {"balance": 0, "currency": "USDT"}, "incentive": {"balance": 0, "currency": "USDT"}, "rewards": {"balance": 0, "currency": "USDT"}}'::JSONB;
    END IF;
END $$;

-- 2. DROP OLD TRIGGERS AND FUNCTIONS TO START FRESH
DROP TRIGGER IF EXISTS tr_update_wallets_on_payment ON public.payments;
DROP TRIGGER IF EXISTS tr_process_package_activation ON public.payments;
DROP TRIGGER IF EXISTS on_payment_finished ON public.payments;
DROP TRIGGER IF EXISTS tr_on_payment_notification ON public.payments;
DROP TRIGGER IF EXISTS tr_update_ancestors_team_size ON public.profiles;

-- Drop functions to avoid return type change errors
-- We drop multiple variations because the signature might have changed in previous attempts
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_funds(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_funds(UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.claim_wallet(UUID, TEXT);
DROP FUNCTION IF EXISTS public.claim_wallet(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_wallets_on_payment();
DROP FUNCTION IF EXISTS public.process_package_activation();
DROP FUNCTION IF EXISTS public.on_payment_notification_trigger();
DROP FUNCTION IF EXISTS public.update_ancestors_team_size();

-- 3. CORE FUNCTIONS

-- Comprehensive RPC for adding payments/income
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
RETURNS JSONB AS $$
DECLARE
    v_uid UUID;
    v_amount NUMERIC;
    v_payment_id UUID;
BEGIN
    -- Explicit casting to avoid "uuid = text" errors
    v_uid := p_uid::UUID;
    v_amount := p_amount::NUMERIC;

    INSERT INTO public.payments (
        uid, amount, type, payment_id, description, status, currency, method, order_id, order_description, updated_at
    ) VALUES (
        v_uid, v_amount, p_type, p_payment_id, p_description, p_status, p_currency, p_method, p_order_id, p_description, NOW()
    ) RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'message', 'Payment recorded successfully');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simplified RPC for adding funds
CREATE OR REPLACE FUNCTION public.admin_add_funds(
    p_uid TEXT,
    p_amount TEXT
)
RETURNS JSONB AS $$
BEGIN
    RETURN public.admin_add_payment_rpc(
        p_uid,
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

-- RPC for claiming wallet balance to master
CREATE OR REPLACE FUNCTION public.claim_wallet(p_uid UUID, p_wallet_key TEXT)
RETURNS VOID AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    -- 1. Get current balance
    SELECT (wallets->p_wallet_key->>'balance')::numeric INTO v_balance
    FROM public.profiles WHERE id = p_uid;
    
    IF v_balance > 0 THEN
        -- 2. Deduct from specific wallet and add to master
        UPDATE public.profiles
        SET wallets = jsonb_set(
            jsonb_set(wallets, ARRAY[p_wallet_key, 'balance'], '0'::jsonb),
            ARRAY['master', 'balance'],
            to_jsonb((wallets->'master'->>'balance')::numeric + v_balance)
        ),
        wallet_balance = (wallets->'master'->>'balance')::numeric + v_balance,
        updated_at = NOW()
        WHERE id = p_uid;
        
        -- 3. Log transaction
        INSERT INTO public.payments (uid, amount, type, status, method, description, created_at)
        VALUES (p_uid, v_balance, 'claim', 'finished', 'INTERNAL', 'Claimed ' || p_wallet_key || ' to Master Vault', NOW());
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for wallet updates
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_type TEXT;
    v_amount NUMERIC;
    v_uid UUID;
BEGIN
    v_amount := NEW.amount;
    v_uid := NEW.uid;

    -- Only process finished/completed payments
    IF NEW.status != 'finished' AND NEW.status != 'completed' AND NEW.status != 'partially_paid' THEN
        RETURN NEW;
    END IF;

    -- Determine wallet type
    v_wallet_type := CASE 
        WHEN NEW.type = 'referral_bonus' THEN 'referral'
        WHEN NEW.type = 'matching_bonus' THEN 'matching'
        WHEN NEW.type = 'rank_reward' THEN 'rewards'
        WHEN NEW.type = 'incentive_accrual' THEN 'incentive'
        WHEN NEW.type = 'team_collection' THEN 'referral'
        ELSE 'master'
    END;

    -- 1. Update JSONB wallets
    UPDATE public.profiles
    SET wallets = jsonb_set(
        COALESCE(wallets, '{"master": {"balance": 0}, "referral": {"balance": 0}, "matching": {"balance": 0}}'::jsonb),
        ARRAY[v_wallet_type, 'balance'],
        to_jsonb(
            (COALESCE((wallets->v_wallet_type->>'balance')::numeric, 0) + 
            CASE 
                WHEN NEW.type IN ('withdrawal', 'package_activation') AND NEW.method = 'WALLET' THEN -v_amount 
                WHEN NEW.type IN ('withdrawal', 'package_activation') AND NEW.method != 'WALLET' THEN 0 -- Don't deduct if it was an external payment or free
                ELSE v_amount 
            END)
        )
    )
    WHERE id = v_uid;

    -- 2. Sync flat wallet_balance (Master Wallet)
    IF v_wallet_type = 'master' THEN
        UPDATE public.profiles
        SET wallet_balance = (COALESCE(wallets->'master'->>'balance', '0'))::numeric
        WHERE id = v_uid;
    END IF;

    -- 3. Update total income and specific cumulative fields
    IF NEW.type NOT IN ('deposit', 'withdrawal', 'package_activation') THEN
        UPDATE public.profiles
        SET 
            total_income = total_income + v_amount,
            referral_income = CASE WHEN NEW.type = 'referral_bonus' THEN referral_income + v_amount ELSE referral_income END,
            matching_income = CASE WHEN NEW.type = 'matching_bonus' THEN matching_income + v_amount ELSE matching_income END
        WHERE id = v_uid;
    END IF;

    -- 4. Log to transactions table
    INSERT INTO public.transactions (uid, amount, type, description, created_at)
    VALUES (v_uid, v_amount, NEW.type, COALESCE(NEW.description, NEW.type), NOW());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for package activation
CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    v_sponsor_id UUID;
    v_sponsor_package NUMERIC;
    v_referral_bonus NUMERIC;
BEGIN
    -- Only process finished package activations
    IF NEW.type != 'package_activation' OR (NEW.status != 'finished' AND NEW.status != 'completed') THEN
        RETURN NEW;
    END IF;

    -- Update user's profile
    UPDATE public.profiles
    SET 
        active_package = NEW.amount,
        status = 'active',
        updated_at = NOW()
    WHERE id = NEW.uid;

    -- Award 10% Direct Referral Bonus if sponsor is eligible
    SELECT sponsor_id INTO v_sponsor_id FROM public.profiles WHERE id = NEW.uid;
    
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
                'Direct Referral Bonus from ' || NEW.uid::text,
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

-- Trigger function for notifications
CREATE OR REPLACE FUNCTION public.on_payment_notification_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'finished' OR NEW.status = 'completed' THEN
        INSERT INTO public.notifications (uid, title, message, type, created_at)
        VALUES (
            NEW.uid,
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
            END,
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to propagate volume and team size up the tree
CREATE OR REPLACE FUNCTION public.update_ancestors_team_size()
RETURNS TRIGGER AS $$
DECLARE
    v_current_id UUID;
    v_parent_id UUID;
    v_side TEXT;
    v_amount NUMERIC;
BEGIN
    -- Only proceed if package activated or parent changed
    IF (TG_OP = 'UPDATE' AND (OLD.active_package = NEW.active_package AND OLD.parent_id IS NOT DISTINCT FROM NEW.parent_id)) THEN
        RETURN NEW;
    END IF;

    v_current_id := NEW.id;
    v_amount := NEW.active_package;

    -- Loop up the tree
    LOOP
        SELECT parent_id, side INTO v_parent_id, v_side 
        FROM public.profiles WHERE id = v_current_id;
        
        EXIT WHEN v_parent_id IS NULL;
        
        -- Update parent's team size and volume
        IF v_side = 'LEFT' THEN
            UPDATE public.profiles 
            SET 
                team_size = jsonb_set(team_size, '{left}', (COALESCE((team_size->>'left')::int, 0) + 1)::text::jsonb),
                matching_volume = jsonb_set(matching_volume, '{left}', (COALESCE((matching_volume->>'left')::numeric, 0) + v_amount)::text::jsonb),
                cumulative_volume = jsonb_set(cumulative_volume, '{left}', (COALESCE((cumulative_volume->>'left')::numeric, 0) + v_amount)::text::jsonb)
            WHERE id = v_parent_id;
        ELSIF v_side = 'RIGHT' THEN
            UPDATE public.profiles 
            SET 
                team_size = jsonb_set(team_size, '{right}', (COALESCE((team_size->>'right')::int, 0) + 1)::text::jsonb),
                matching_volume = jsonb_set(matching_volume, '{right}', (COALESCE((matching_volume->>'right')::numeric, 0) + v_amount)::text::jsonb),
                cumulative_volume = jsonb_set(cumulative_volume, '{right}', (COALESCE((cumulative_volume->>'right')::numeric, 0) + v_amount)::text::jsonb)
            WHERE id = v_parent_id;
        END IF;
        
        v_current_id := v_parent_id;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ATTACH TRIGGERS

CREATE TRIGGER tr_update_wallets_on_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();

CREATE TRIGGER tr_process_package_activation
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.process_package_activation();

CREATE TRIGGER tr_on_payment_notification
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.on_payment_notification_trigger();

-- Ensure volume propagation trigger is also correctly attached
CREATE TRIGGER tr_update_ancestors_team_size
AFTER UPDATE OF active_package, parent_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_ancestors_team_size();

-- 5. FINAL SYNC
UPDATE public.profiles 
SET wallet_balance = (COALESCE(wallets->'master'->>'balance', '0'))::numeric
WHERE wallets->'master'->>'balance' IS NOT NULL;

-- 6. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(TEXT, TEXT) TO service_role;
