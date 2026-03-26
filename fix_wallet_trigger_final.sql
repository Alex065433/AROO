-- 1. Fix admin_add_payment_rpc to handle explicit UUID casting and amount as TEXT
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid TEXT, 
    p_amount TEXT, 
    p_type TEXT, 
    p_method TEXT, 
    p_description TEXT,
    p_status TEXT DEFAULT 'finished',
    p_payment_id TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'usdtbsc',
    p_order_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_numeric_amount NUMERIC;
BEGIN
    -- Cast amount to numeric
    v_numeric_amount := p_amount::NUMERIC;

    -- Insert payment record
    INSERT INTO public.payments (
        uid, 
        amount, 
        type, 
        status, 
        method, 
        order_description, 
        payment_id,
        currency,
        order_id
    ) VALUES (
        p_uid::UUID, 
        v_numeric_amount, 
        p_type, 
        p_status, 
        p_method, 
        p_description, 
        p_payment_id,
        p_currency,
        p_order_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix update_wallets_on_payment to update both flat columns and JSONB wallets
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    wallet_key TEXT;
    v_amount NUMERIC;
BEGIN
    -- Only process if status is finished or completed
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        
        v_amount := NEW.amount;

        -- Determine which sub-wallet to update based on payment type
        wallet_key := CASE 
            WHEN NEW.type IN ('referral_bonus', 'referral_income') THEN 'referral'
            WHEN NEW.type IN ('matching_bonus', 'matching_income', 'binary_matching', 'binary_income') THEN 'matching'
            WHEN NEW.type IN ('rank_reward', 'rank_bonus') THEN 'rankBonus'
            WHEN NEW.type IN ('incentive_accrual', 'weekly_incentive', 'incentive_income') THEN 'incentive'
            WHEN NEW.type IN ('team_collection', 'reward_income', 'node_income') THEN 'rewards'
            ELSE 'master'
        END;

        -- Update the profiles table (Both flat columns and JSONB)
        IF wallet_key != 'master' THEN
            -- Income types: Update specific income column, total_income, and both sub-wallet and master wallet
            UPDATE public.profiles
            SET 
                -- Flat columns
                referral_income = CASE WHEN wallet_key = 'referral' THEN COALESCE(referral_income, 0) + v_amount ELSE referral_income END,
                matching_income = CASE WHEN wallet_key = 'matching' THEN COALESCE(matching_income, 0) + v_amount ELSE matching_income END,
                total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                -- JSONB Wallets
                wallets = jsonb_set(
                    jsonb_set(
                        COALESCE(wallets, '{"master": {"balance": 0, "currency": "USDT"}, "referral": {"balance": 0, "currency": "USDT"}, "matching": {"balance": 0, "currency": "USDT"}, "rankBonus": {"balance": 0, "currency": "USDT"}, "incentive": {"balance": 0, "currency": "USDT"}, "rewards": {"balance": 0, "currency": "USDT"}}'::jsonb),
                        ARRAY[wallet_key, 'balance'], 
                        to_jsonb(((COALESCE(wallets->wallet_key->>'balance', '0'))::numeric + v_amount))
                    ),
                    ARRAY['master', 'balance'], 
                    to_jsonb(((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount))
                )
            WHERE id = NEW.uid::uuid;
        ELSE
            -- Master wallet updates (deposits, withdrawals, package activations)
            UPDATE public.profiles
            SET 
                -- Flat columns
                wallet_balance = CASE 
                    WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                        COALESCE(wallet_balance, 0) - v_amount
                    WHEN NEW.type = 'deposit' THEN
                        COALESCE(wallet_balance, 0) + v_amount
                    ELSE 
                        wallet_balance
                END,
                -- JSONB Wallets
                wallets = jsonb_set(
                    COALESCE(wallets, '{"master": {"balance": 0, "currency": "USDT"}, "referral": {"balance": 0, "currency": "USDT"}, "matching": {"balance": 0, "currency": "USDT"}, "rankBonus": {"balance": 0, "currency": "USDT"}, "incentive": {"balance": 0, "currency": "USDT"}, "rewards": {"balance": 0, "currency": "USDT"}}'::jsonb),
                    ARRAY['master', 'balance'], 
                    to_jsonb(CASE 
                        WHEN NEW.type = 'withdrawal' OR (NEW.type = 'package_activation' AND NEW.method = 'WALLET') THEN 
                            ((COALESCE(wallets->'master'->>'balance', '0'))::numeric - v_amount)
                        WHEN NEW.type = 'deposit' THEN
                            ((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount)
                        ELSE 
                            (COALESCE(wallets->'master'->>'balance', '0'))::numeric
                    END)
                )
            WHERE id = NEW.uid::uuid;
        END IF;

        -- Log to transactions table
        INSERT INTO public.transactions (uid, amount, type, description)
        VALUES (NEW.uid::uuid, NEW.amount, NEW.type, COALESCE(NEW.order_description, NEW.type) || ' (' || NEW.type || ')');
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Sync existing wallet_balance with JSONB wallets to fix current display issues
UPDATE public.profiles 
SET wallet_balance = (COALESCE(wallets->'master'->>'balance', '0'))::numeric;

-- 4. Ensure the trigger is active
DROP TRIGGER IF EXISTS on_payment_update_wallets ON public.payments;
CREATE TRIGGER on_payment_update_wallets
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
