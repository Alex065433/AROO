-- Fix for wallet synchronization and admin funds
-- This script ensures that both flat columns and JSONB wallets are updated
-- and that the admin_add_payment_rpc works correctly.

-- 1. Robust update_wallets_on_payment function
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_amount NUMERIC;
    v_wallet_key TEXT;
BEGIN
    -- Only process if status is finished or completed
    IF (NEW.status = 'finished' OR NEW.status = 'completed') AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('finished', 'completed')))) THEN
        
        v_amount := NEW.amount;

        -- Determine which sub-wallet to update in JSONB
        v_wallet_key := CASE 
            WHEN NEW.type IN ('referral_bonus', 'referral_income') THEN 'referral'
            WHEN NEW.type IN ('matching_bonus', 'matching_income', 'binary_matching', 'binary_income') THEN 'matching'
            WHEN NEW.type IN ('rank_reward', 'rank_bonus') THEN 'rankBonus'
            WHEN NEW.type IN ('incentive_accrual', 'weekly_incentive', 'incentive_income') THEN 'incentive'
            WHEN NEW.type IN ('team_collection', 'reward_income', 'node_income') THEN 'rewards'
            ELSE 'master'
        END;

        -- Update flat columns AND JSONB wallets
        IF NEW.type IN ('referral_bonus', 'referral_income') THEN
            UPDATE public.profiles 
            SET referral_income = COALESCE(referral_income, 0) + v_amount,
                total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                wallets = jsonb_set(
                    jsonb_set(wallets, ARRAY['referral', 'balance'], to_jsonb((COALESCE(wallets->'referral'->>'balance', '0'))::numeric + v_amount)),
                    ARRAY['master', 'balance'], to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount)
                )
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type IN ('matching_bonus', 'matching_income', 'binary_matching', 'binary_income') THEN
            UPDATE public.profiles 
            SET matching_income = COALESCE(matching_income, 0) + v_amount,
                total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                wallets = jsonb_set(
                    jsonb_set(wallets, ARRAY['matching', 'balance'], to_jsonb((COALESCE(wallets->'matching'->>'balance', '0'))::numeric + v_amount)),
                    ARRAY['master', 'balance'], to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount)
                )
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'deposit' THEN
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                wallets = jsonb_set(wallets, ARRAY['master', 'balance'], to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount))
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'withdrawal' THEN
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) - v_amount,
                wallets = jsonb_set(wallets, ARRAY['master', 'balance'], to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric - v_amount))
            WHERE id = NEW.uid::uuid;
        ELSIF NEW.type = 'package_activation' THEN
            IF NEW.method = 'WALLET' THEN
                UPDATE public.profiles 
                SET wallet_balance = COALESCE(wallet_balance, 0) - v_amount,
                    wallets = jsonb_set(wallets, ARRAY['master', 'balance'], to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric - v_amount))
                WHERE id = NEW.uid::uuid;
            END IF;
        ELSE
            -- Default for other income types
            UPDATE public.profiles 
            SET total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount,
                wallets = jsonb_set(
                    jsonb_set(wallets, ARRAY[v_wallet_key, 'balance'], to_jsonb((COALESCE(wallets->v_wallet_key->>'balance', '0'))::numeric + v_amount)),
                    ARRAY['master', 'balance'], to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric + v_amount)
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

-- 2. Re-create the trigger to ensure it's active
DROP TRIGGER IF EXISTS on_payment_update_wallets ON public.payments;
CREATE TRIGGER on_payment_update_wallets
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_wallets_on_payment();

-- 3. Update admin_add_payment_rpc to be clean (relying on trigger)
-- We remove the direct update to avoid double-counting if the trigger works.
-- If the trigger is active, this is the correct way.
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
RETURNS JSON AS $$
DECLARE
    v_payment_id UUID;
    v_numeric_amount NUMERIC;
BEGIN
    -- Convert amount to numeric
    v_numeric_amount := p_amount::NUMERIC;

    -- Insert the payment record
    INSERT INTO public.payments (
        uid, 
        amount, 
        type, 
        status, 
        method, 
        order_description, 
        payment_id, 
        currency, 
        order_id, 
        created_at
    )
    VALUES (
        p_uid::UUID, 
        v_numeric_amount, 
        p_type, 
        p_status, 
        p_method, 
        p_description, 
        p_payment_id, 
        p_currency, 
        p_order_id, 
        NOW()
    )
    RETURNING id INTO v_payment_id;

    -- Return success info
    RETURN json_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'message', 'Payment recorded successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
