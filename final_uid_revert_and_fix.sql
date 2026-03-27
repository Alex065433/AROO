-- ==============================================================================
-- FINAL UID REVERT AND FIX SCRIPT
-- ==============================================================================
-- This script reverts the 'user_id' column back to 'uid' in payments, 
-- transactions, and notifications tables. It also updates all relevant 
-- RPCs and triggers to use 'uid', fixing the "record 'new' has no field 'uid'" error.

BEGIN;

-- 1. Revert column names back to 'uid'
DO $$ 
BEGIN
    -- Revert payments table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'user_id') THEN
        ALTER TABLE public.payments RENAME COLUMN user_id TO uid;
    END IF;

    -- Revert transactions table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'user_id') THEN
        ALTER TABLE public.transactions RENAME COLUMN user_id TO uid;
    END IF;

    -- Revert notifications table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'user_id') THEN
        ALTER TABLE public.notifications RENAME COLUMN user_id TO uid;
    END IF;
END $$;

-- 2. Drop existing functions to avoid signature conflicts
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_funds(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.activate_package(TEXT, TEXT);

-- 3. Recreate admin_add_payment_rpc using 'uid'
CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid TEXT,
    p_amount TEXT,
    p_type TEXT,
    p_payment_id TEXT DEFAULT NULL,
    p_method TEXT DEFAULT 'CRYPTO',
    p_description TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'finished',
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

-- 4. Recreate admin_add_funds
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
        'ADMIN_CREDIT',
        'ADMIN',
        'Funds added by administrator',
        'finished',
        'usdtbsc',
        'Admin Credit'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Recreate activate_package
CREATE OR REPLACE FUNCTION public.activate_package(
    p_user_id TEXT,
    p_amount TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_amount NUMERIC;
    v_profile RECORD;
    v_master_balance NUMERIC;
    v_rpc_result JSONB;
BEGIN
    v_user_id := p_user_id::UUID;
    v_amount := p_amount::NUMERIC;

    -- Get user profile and master wallet balance
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
    END IF;

    v_master_balance := COALESCE((v_profile.wallets->'master'->>'balance')::NUMERIC, 0);

    -- Check if user has enough balance
    IF v_master_balance < v_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient master wallet balance');
    END IF;

    -- Call admin_add_payment_rpc to record the package activation
    -- This will trigger update_wallets_on_payment and process_package_activation
    v_rpc_result := public.admin_add_payment_rpc(
        p_user_id,
        p_amount,
        'package_activation',
        'WALLET',
        'Package Activation: $' || p_amount::TEXT,
        'finished'
    );

    IF (v_rpc_result->>'success')::boolean = true THEN
        RETURN jsonb_build_object('success', true, 'message', 'Package activated successfully', 'payment_id', v_rpc_result->>'payment_id');
    ELSE
        RETURN jsonb_build_object('success', false, 'error', v_rpc_result->>'error');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Ensure update_wallets_on_payment trigger function uses NEW.uid
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_type TEXT;
    v_amount NUMERIC;
    v_uid UUID;
BEGIN
    v_amount := NEW.amount;
    v_uid := NEW.uid;

    -- Only process finished or completed payments
    IF NEW.status != 'finished' AND NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    -- Only process on INSERT, or on UPDATE if status changed to finished
    IF TG_OP = 'UPDATE' AND (OLD.status = 'finished' OR OLD.status = 'completed') THEN
        RETURN NEW;
    END IF;

    -- Determine wallet type based on payment type
    CASE NEW.type
        WHEN 'deposit' THEN v_wallet_type := 'master';
        WHEN 'withdrawal' THEN v_wallet_type := 'master';
        WHEN 'referral_bonus' THEN v_wallet_type := 'referral';
        WHEN 'matching_bonus' THEN v_wallet_type := 'matching';
        WHEN 'rank_reward' THEN v_wallet_type := 'rewards';
        WHEN 'incentive_accrual' THEN v_wallet_type := 'incentive';
        WHEN 'team_collection' THEN v_wallet_type := 'referral';
        WHEN 'package_activation' THEN v_wallet_type := 'master'; -- Deduct from master
        ELSE v_wallet_type := 'master';
    END CASE;

    -- Handle deductions for withdrawals and package activations
    IF NEW.type IN ('withdrawal', 'package_activation') THEN
        v_amount := -v_amount;
    END IF;

    -- Update the specific wallet balance
    UPDATE public.profiles
    SET wallets = jsonb_set(
        COALESCE(wallets, '{"master": {"balance": 0}, "referral": {"balance": 0}, "matching": {"balance": 0}, "rewards": {"balance": 0}, "incentive": {"balance": 0}}'::jsonb),
        ARRAY[v_wallet_type, 'balance'],
        to_jsonb(COALESCE((wallets->v_wallet_type->>'balance')::numeric, 0) + v_amount)
    )
    WHERE id = v_uid;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Ensure on_payment_notification_trigger uses NEW.uid
CREATE OR REPLACE FUNCTION public.on_payment_notification_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'finished' AND OLD.status != 'completed')) THEN
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

-- 8. Ensure process_package_activation uses NEW.uid
CREATE OR REPLACE FUNCTION public.process_package_activation()
RETURNS TRIGGER AS $$
DECLARE
    v_package_amount NUMERIC;
    v_sponsor_id UUID;
    v_referral_bonus NUMERIC;
BEGIN
    -- Only process if payment is finished and type is package_activation
    IF NEW.type != 'package_activation' OR (NEW.status != 'finished' AND NEW.status != 'completed') THEN
        RETURN NEW;
    END IF;

    -- Only process on INSERT, or on UPDATE if status changed to finished
    IF TG_OP = 'UPDATE' AND (OLD.status = 'finished' OR OLD.status = 'completed') THEN
        RETURN NEW;
    END IF;

    v_package_amount := NEW.amount;

    -- 1. Update user's active_package and total_investment
    UPDATE public.profiles
    SET 
        active_package = COALESCE(active_package, 0) + v_package_amount,
        total_investment = COALESCE(total_investment, 0) + v_package_amount,
        rank = CASE WHEN COALESCE(active_package, 0) + v_package_amount >= 100 THEN GREATEST(COALESCE(rank, 0), 1) ELSE COALESCE(rank, 0) END
    WHERE id = NEW.uid
    RETURNING sponsor_id INTO v_sponsor_id;

    -- 2. Process Direct Referral Bonus (5%)
    IF v_sponsor_id IS NOT NULL THEN
        v_referral_bonus := v_package_amount * 0.05;
        
        -- Use admin_add_payment_rpc to credit the sponsor
        -- This will automatically trigger update_wallets_on_payment for the sponsor
        BEGIN
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
        EXCEPTION WHEN OTHERS THEN
            -- Log error but don't fail the whole transaction
            RAISE WARNING 'Failed to process referral bonus: %', SQLERRM;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
