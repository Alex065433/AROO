-- final_comprehensive_fix.sql

-- 0. Ensure required columns exist in profiles table
DO $$ 
BEGIN 
    -- Check total_deposit
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='total_deposit') THEN
        ALTER TABLE public.profiles ADD COLUMN total_deposit NUMERIC DEFAULT 0;
    END IF;
    
    -- Check total_income
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='total_income') THEN
        ALTER TABLE public.profiles ADD COLUMN total_income NUMERIC DEFAULT 0;
    END IF;

    -- Check wallet_balance
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_balance') THEN
        ALTER TABLE public.profiles ADD COLUMN wallet_balance NUMERIC DEFAULT 0;
    END IF;

    -- Check wallets JSONB
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallets') THEN
        ALTER TABLE public.profiles ADD COLUMN wallets JSONB DEFAULT '{"master": {"balance": 0}, "income": {"balance": 0}, "withdrawal": {"balance": 0}}'::jsonb;
    END IF;

    -- Check updated_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='updated_at') THEN
        ALTER TABLE public.profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Check created_at (just in case)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='created_at') THEN
        ALTER TABLE public.profiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Check payments table columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='updated_at') THEN
        ALTER TABLE public.payments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='created_at') THEN
        ALTER TABLE public.payments ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='method') THEN
        ALTER TABLE public.payments ADD COLUMN method TEXT DEFAULT 'CRYPTO';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='order_description') THEN
        ALTER TABLE public.payments ADD COLUMN order_description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='type') THEN
        ALTER TABLE public.payments ADD COLUMN type TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='status') THEN
        ALTER TABLE public.payments ADD COLUMN status TEXT DEFAULT 'waiting';
    END IF;

    -- Check transactions table columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='created_at') THEN
        ALTER TABLE public.transactions ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='updated_at') THEN
        ALTER TABLE public.transactions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Check other tables for updated_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='updated_at') THEN
        ALTER TABLE public.notifications ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='is_new') THEN
        ALTER TABLE public.notifications ADD COLUMN is_new BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='updated_at') THEN
        ALTER TABLE public.tickets ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_collection' AND column_name='updated_at') THEN
        ALTER TABLE public.team_collection ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_collection' AND column_name='eligible') THEN
        ALTER TABLE public.team_collection ADD COLUMN eligible BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_collection' AND column_name='balance') THEN
        ALTER TABLE public.team_collection ADD COLUMN balance NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_collection' AND column_name='node_id') THEN
        ALTER TABLE public.team_collection ADD COLUMN node_id TEXT;
    END IF;
END $$;

-- 0.1 Ensure JSONB wallets have master, income, withdrawal
UPDATE public.profiles
SET wallets = jsonb_set(
    COALESCE(wallets, '{}'::jsonb),
    '{master}',
    COALESCE(wallets->'master', '{"balance": 0, "currency": "USDT"}'::jsonb)
)
WHERE wallets IS NULL OR wallets->'master' IS NULL;

UPDATE public.profiles
SET wallets = jsonb_set(
    wallets,
    '{income}',
    COALESCE(wallets->'income', '{"balance": 0, "currency": "USDT"}'::jsonb)
)
WHERE wallets->'income' IS NULL;

UPDATE public.profiles
SET wallets = jsonb_set(
    wallets,
    '{withdrawal}',
    COALESCE(wallets->'withdrawal', '{"balance": 0, "currency": "USDT"}'::jsonb)
)
WHERE wallets->'withdrawal' IS NULL;

-- 1. Fix admin_add_payment_rpc to handle TEXT inputs and cast to UUID/NUMERIC
CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid TEXT, 
    p_amount TEXT, 
    p_type TEXT, 
    p_method TEXT, 
    p_description TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_numeric_amount NUMERIC;
    v_payment_id UUID;
BEGIN
    -- Explicitly cast amount to numeric
    v_numeric_amount := p_amount::NUMERIC;
    
    -- Insert with explicit UUID cast for p_uid
    INSERT INTO public.payments (uid, amount, type, status, method, order_description, created_at)
    VALUES (p_uid::UUID, v_numeric_amount, p_type, 'finished', p_method, p_description, NOW())
    RETURNING id INTO v_payment_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'amount', v_numeric_amount
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Refine the wallet update trigger to ensure UUID casting and JSONB integrity
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_amount NUMERIC;
    v_uid UUID;
BEGIN
    v_amount := NEW.amount;
    v_uid := NEW.uid::UUID; -- Ensure UUID type
    
    -- Only process finished/completed payments
    IF NEW.status != 'finished' AND NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    -- 1. Handle Package Activation from Wallet
    IF NEW.type = 'package_activation' AND NEW.method = 'WALLET' THEN
        UPDATE public.profiles
        SET 
            wallets = jsonb_set(
                COALESCE(wallets, '{"master": {"balance": 0}, "income": {"balance": 0}, "withdrawal": {"balance": 0}}'::jsonb),
                ARRAY['master', 'balance'],
                to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric - v_amount)
            ),
            wallet_balance = (COALESCE(wallets->'master'->>'balance', '0'))::numeric - v_amount,
            updated_at = NOW()
        WHERE id = v_uid;
        
    -- 2. Handle Withdrawals
    ELSIF NEW.type = 'withdrawal' THEN
        UPDATE public.profiles
        SET 
            wallets = jsonb_set(
                COALESCE(wallets, '{"master": {"balance": 0}, "income": {"balance": 0}, "withdrawal": {"balance": 0}}'::jsonb),
                ARRAY['withdrawal', 'balance'],
                to_jsonb((COALESCE(wallets->'withdrawal'->>'balance', '0'))::numeric + v_amount)
            ),
            updated_at = NOW()
        WHERE id = v_uid;

    -- 3. Handle Income (Bonuses, ROI)
    ELSIF NEW.type IN ('referral_bonus', 'binary_bonus', 'matching_bonus', 'roi_income') THEN
        UPDATE public.profiles
        SET 
            wallets = jsonb_set(
                COALESCE(wallets, '{"master": {"balance": 0}, "income": {"balance": 0}, "withdrawal": {"balance": 0}}'::jsonb),
                ARRAY['income', 'balance'],
                to_jsonb((COALESCE(wallets->'income'->>'balance', '0'))::numeric + v_amount)
            ),
            total_income = total_income + v_amount,
            updated_at = NOW()
        WHERE id = v_uid;

    -- 4. Handle Deposits and other additions to Master Wallet
    ELSE
        UPDATE public.profiles
        SET 
            wallets = jsonb_set(
                COALESCE(wallets, '{"master": {"balance": 0}, "income": {"balance": 0}, "withdrawal": {"balance": 0}}'::jsonb),
                ARRAY['master', 'balance'],
                to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount)
            ),
            wallet_balance = (COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount,
            total_deposit = CASE WHEN NEW.type = 'deposit' THEN total_deposit + v_amount ELSE total_deposit END,
            updated_at = NOW()
        WHERE id = v_uid;
    END IF;

    -- Log to transactions table with explicit UUID cast
    INSERT INTO public.transactions (uid, amount, type, description, created_at)
    VALUES (
        v_uid, 
        v_amount, 
        NEW.type, 
        COALESCE(NEW.order_description, NEW.type),
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure the trigger is correctly attached
DROP TRIGGER IF EXISTS on_payment_finished ON public.payments;
CREATE TRIGGER on_payment_finished
    AFTER INSERT OR UPDATE OF status ON public.payments
    FOR EACH ROW
    WHEN (NEW.status = 'finished' OR NEW.status = 'completed')
    EXECUTE FUNCTION public.update_wallets_on_payment();

-- 4. Sync existing wallet_balance column with JSONB master balance for consistency
UPDATE public.profiles 
SET wallet_balance = (COALESCE(wallets->'master'->>'balance', '0'))::numeric
WHERE wallets->'master'->>'balance' IS NOT NULL;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
