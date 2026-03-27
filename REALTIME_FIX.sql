
-- 1. ENABLE REALTIME FOR PROFILES
-- This is critical for the frontend to reflect balance changes immediately
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
END $$;

-- 2. SET REPLICA IDENTITY TO FULL
-- This ensures the entire row is sent in the realtime payload, 
-- which helps the frontend state management.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- 3. ENHANCE THE WALLET UPDATE TRIGGER
-- Use COALESCE to prevent NULL issues if balance columns are not initialized
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
    ),
    -- Also update the flat columns for easier access
    wallet_balance = CASE 
        WHEN v_wallet_type = 'master' THEN 
            COALESCE(wallet_balance, 0) + 
            CASE 
                WHEN NEW.type IN ('withdrawal', 'package_activation') THEN -NEW.amount 
                ELSE NEW.amount 
            END
        ELSE wallet_balance 
    END,
    referral_income = CASE 
        WHEN v_wallet_type = 'referral' THEN 
            COALESCE(referral_income, 0) + NEW.amount
        ELSE referral_income 
    END,
    matching_income = CASE 
        WHEN v_wallet_type = 'matching' THEN 
            COALESCE(matching_income, 0) + NEW.amount
        ELSE matching_income 
    END,
    total_income = CASE 
        WHEN NEW.type NOT IN ('deposit', 'withdrawal', 'package_activation') THEN 
            COALESCE(total_income, 0) + NEW.amount
        ELSE total_income 
    END
    WHERE id = NEW.user_id;

    -- 2. Log to transactions table
    INSERT INTO public.transactions (user_id, amount, type, description, status)
    VALUES (NEW.user_id, NEW.amount, NEW.type, NEW.description, 'completed');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ENSURE admin_add_funds IS ROBUST
CREATE OR REPLACE FUNCTION public.admin_add_funds(
    p_user_id TEXT,
    p_amount TEXT
)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_amount NUMERIC;
BEGIN
    v_user_id := p_user_id::UUID;
    v_amount := p_amount::NUMERIC;

    -- Directly insert into payments, which triggers the wallet update
    INSERT INTO public.payments (
        user_id, amount, type, payment_id, description, status, currency, wallet_type, order_description, method
    ) VALUES (
        v_user_id, v_amount, 'deposit', 'ADMIN_' || floor(extract(epoch from now())), 
        'Funds added by administrator', 'finished', 'usdtbsc', 'master', 'Admin Credit', 'ADMIN'
    );

    RETURN json_build_object('success', true, 'message', 'Funds added and wallet updated');
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RE-ATTACH TRIGGERS
DROP TRIGGER IF EXISTS tr_update_wallets_on_payment ON public.payments;
CREATE TRIGGER tr_update_wallets_on_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW 
WHEN (NEW.status = 'finished' OR NEW.status = 'partially_paid')
EXECUTE FUNCTION public.update_wallets_on_payment();
