-- MASTER DATABASE CLEANUP AND FIX
-- RUN THIS SCRIPT TO RESOLVE ALL RPC AND UUID ERRORS

DO $$ 
BEGIN
    -- 1. UNIFY COLUMN NAMES IN PAYMENTS TABLE
    -- We use 'user_id' to match auth.users(id) and other tables
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'uid') THEN
        ALTER TABLE public.payments RENAME COLUMN uid TO user_id;
    END IF;

    -- Ensure user_id is UUID type
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'user_id' AND data_type = 'text') THEN
        ALTER TABLE public.payments ALTER COLUMN user_id TYPE UUID USING user_id::UUID;
    END IF;

    -- Ensure other tables are consistent
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'uid') THEN
        ALTER TABLE public.transactions RENAME COLUMN uid TO user_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'uid') THEN
        ALTER TABLE public.notifications RENAME COLUMN uid TO user_id;
    END IF;
END $$;

-- 2. DROP ALL CONFLICTING RPC FUNCTIONS
-- This clears any ambiguity or overloading issues
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_funds(UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.admin_add_funds(TEXT, TEXT);

-- 3. CREATE THE DEFINITIVE admin_add_payment_rpc
-- This version handles TEXT inputs and casts them internally for maximum compatibility
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

-- 4. CREATE THE DEFINITIVE admin_add_funds
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

-- 5. RE-SYNC TRIGGERS TO USE user_id
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_type TEXT;
BEGIN
    -- Determine wallet type
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

-- Re-attach triggers
DROP TRIGGER IF EXISTS tr_update_wallets_on_payment ON public.payments;
CREATE TRIGGER tr_update_wallets_on_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();

DROP TRIGGER IF EXISTS tr_on_payment_notification ON public.payments;
CREATE TRIGGER tr_on_payment_notification
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.on_payment_notification_trigger();

-- 6. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(TEXT, TEXT) TO service_role;
