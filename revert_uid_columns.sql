-- Revert user_id back to uid in payments, transactions, and notifications
-- This is necessary because the frontend and all triggers expect 'uid'

DO $$ 
BEGIN
    -- 1. Revert payments table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'user_id') THEN
        ALTER TABLE public.payments RENAME COLUMN user_id TO uid;
    END IF;

    -- 2. Revert transactions table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'user_id') THEN
        ALTER TABLE public.transactions RENAME COLUMN user_id TO uid;
    END IF;

    -- 3. Revert notifications table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'user_id') THEN
        ALTER TABLE public.notifications RENAME COLUMN user_id TO uid;
    END IF;
END $$;

-- 4. Recreate admin_add_payment_rpc to use uid instead of user_id
-- We drop the old ones first
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

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

-- 5. Recreate admin_add_funds to use the updated RPC
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

-- 6. Recreate on_payment_notification_trigger to use uid
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
