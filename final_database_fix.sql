-- FINAL DATABASE FIX FOR ADMIN PANEL AND FUNDS ISSUES
-- This script ensures all RPC functions and triggers handle UUID types correctly

-- 1. Drop all possible versions of admin_add_payment_rpc to avoid ambiguity
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- 2. Create the definitive version of admin_add_payment_rpc
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

    -- Insert the payment record with explicit UUID casting for p_uid
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

    RETURN json_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'message', 'Payment added successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure the wallet update trigger is robust
CREATE OR REPLACE FUNCTION public.update_wallets_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_amount NUMERIC;
    v_uid UUID;
    current_wallets JSONB;
BEGIN
    v_amount := NEW.amount;
    v_uid := NEW.uid::UUID;

    -- Only process finished/completed payments
    IF NEW.status = 'finished' OR NEW.status = 'completed' THEN
        
        -- Get current wallets
        SELECT wallets INTO current_wallets FROM public.profiles WHERE id = v_uid;
        
        -- Ensure wallet structure exists
        IF current_wallets IS NULL THEN
            current_wallets := '{
                "master": {"balance": 0, "currency": "USDT"},
                "referral": {"balance": 0, "currency": "USDT"},
                "matching": {"balance": 0, "currency": "USDT"},
                "rankBonus": {"balance": 0, "currency": "USDT"},
                "incentive": {"balance": 0, "currency": "USDT"},
                "rewards": {"balance": 0, "currency": "USDT"}
            }'::jsonb;
        END IF;

        -- Handle different payment types
        IF NEW.type = 'deposit' THEN
            -- Add to flat balance
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) + v_amount
            WHERE id = v_uid;
            
            -- Also add to JSONB master wallet
            current_wallets := jsonb_set(
                current_wallets,
                ARRAY['master', 'balance'],
                to_jsonb((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric + v_amount)
            );
            
        ELSIF NEW.type = 'package_activation' THEN
            IF NEW.method = 'WALLET' THEN
                -- Deduct from flat balance
                UPDATE public.profiles 
                SET wallet_balance = COALESCE(wallet_balance, 0) - v_amount
                WHERE id = v_uid;
                
                -- Also deduct from JSONB master wallet
                current_wallets := jsonb_set(
                    current_wallets,
                    ARRAY['master', 'balance'],
                    to_jsonb((COALESCE(current_wallets->'master'->>'balance', '0'))::numeric - v_amount)
                );
            END IF;
            
        ELSIF NEW.type IN ('referral_bonus', 'matching_bonus', 'rank_bonus', 'weekly_incentive', 'daily_roi') THEN
            -- Update total income
            UPDATE public.profiles 
            SET total_income = COALESCE(total_income, 0) + v_amount,
                wallet_balance = COALESCE(wallet_balance, 0) + v_amount
            WHERE id = v_uid;
            
            -- Determine which JSONB wallet to update
            DECLARE
                wallet_key TEXT;
            BEGIN
                wallet_key := CASE 
                    WHEN NEW.type = 'referral_bonus' THEN 'referral'
                    WHEN NEW.type = 'matching_bonus' THEN 'matching'
                    WHEN NEW.type = 'rank_bonus' THEN 'rankBonus'
                    WHEN NEW.type = 'weekly_incentive' THEN 'incentive'
                    WHEN NEW.type = 'daily_roi' THEN 'rewards'
                    ELSE 'master'
                END;
                
                current_wallets := jsonb_set(
                    current_wallets,
                    ARRAY[wallet_key, 'balance'],
                    to_jsonb((COALESCE(current_wallets->wallet_key->>'balance', '0'))::numeric + v_amount)
                );
            END;
        END IF;

        -- Save updated JSONB wallets
        UPDATE public.profiles SET wallets = current_wallets WHERE id = v_uid;

        -- Log to transactions table
        INSERT INTO public.transactions (uid, amount, type, description)
        VALUES (v_uid, v_amount, NEW.type, COALESCE(NEW.order_description, NEW.type));
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-apply the trigger
DROP TRIGGER IF EXISTS on_payment_finished ON public.payments;
CREATE TRIGGER on_payment_finished
    AFTER INSERT OR UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_wallets_on_payment();

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT ALL ON public.payments TO service_role;
GRANT ALL ON public.payments TO authenticated;
GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.transactions TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.profiles TO authenticated;
