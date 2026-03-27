-- FIX FOR update_wallets_on_payment TRIGGER
-- This script replaces the trigger function to avoid referencing NEW.wallet_type
-- which might not exist on the payments table.

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

    -- Determine wallet type based on payment type instead of relying on a potentially missing column
    v_wallet_type := CASE 
        WHEN NEW.type = 'referral_bonus' THEN 'referral'
        WHEN NEW.type = 'matching_bonus' THEN 'matching'
        WHEN NEW.type = 'rank_reward' THEN 'rewards'
        WHEN NEW.type = 'incentive_accrual' THEN 'incentive'
        WHEN NEW.type = 'team_collection' THEN 'referral'
        ELSE 'master'
    END;

    -- 1. Update JSONB wallets and flat columns in a single statement
    IF v_wallet_type = 'master' THEN
        UPDATE public.profiles
        SET 
            wallets = jsonb_set(
                COALESCE(wallets, '{"master": {"balance": 0}, "referral": {"balance": 0}, "matching": {"balance": 0}}'::jsonb),
                ARRAY[v_wallet_type, 'balance'],
                to_jsonb(
                    (COALESCE((wallets->v_wallet_type->>'balance')::numeric, 0) + 
                    CASE 
                        WHEN NEW.type IN ('withdrawal', 'package_activation') AND NEW.method = 'WALLET' THEN -v_amount 
                        WHEN NEW.type IN ('withdrawal', 'package_activation') AND NEW.method != 'WALLET' THEN 0
                        ELSE v_amount 
                    END)
                )
            ),
            wallet_balance = (COALESCE((wallets->v_wallet_type->>'balance')::numeric, 0) + 
                CASE 
                    WHEN NEW.type IN ('withdrawal', 'package_activation') AND NEW.method = 'WALLET' THEN -v_amount 
                    WHEN NEW.type IN ('withdrawal', 'package_activation') AND NEW.method != 'WALLET' THEN 0
                    ELSE v_amount 
                END),
            total_income = CASE WHEN NEW.type NOT IN ('deposit', 'withdrawal', 'package_activation') THEN COALESCE(total_income, 0) + v_amount ELSE total_income END
        WHERE id = v_uid;
    ELSE
        UPDATE public.profiles
        SET 
            wallets = jsonb_set(
                COALESCE(wallets, '{"master": {"balance": 0}, "referral": {"balance": 0}, "matching": {"balance": 0}}'::jsonb),
                ARRAY[v_wallet_type, 'balance'],
                to_jsonb(
                    (COALESCE((wallets->v_wallet_type->>'balance')::numeric, 0) + 
                    CASE 
                        WHEN NEW.type IN ('withdrawal', 'package_activation') AND NEW.method = 'WALLET' THEN -v_amount 
                        WHEN NEW.type IN ('withdrawal', 'package_activation') AND NEW.method != 'WALLET' THEN 0
                        ELSE v_amount 
                    END)
                )
            ),
            total_income = CASE WHEN NEW.type NOT IN ('deposit', 'withdrawal', 'package_activation') THEN COALESCE(total_income, 0) + v_amount ELSE total_income END,
            referral_income = CASE WHEN NEW.type = 'referral_bonus' THEN COALESCE(referral_income, 0) + v_amount ELSE referral_income END,
            matching_income = CASE WHEN NEW.type = 'matching_bonus' THEN COALESCE(matching_income, 0) + v_amount ELSE matching_income END
        WHERE id = v_uid;
    END IF;

    -- 4. Log to transactions table
    INSERT INTO public.transactions (uid, amount, type, description, created_at)
    VALUES (v_uid, v_amount, NEW.type, COALESCE(NEW.description, NEW.type), NOW());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC to activate a package for a user
-- This function handles balance checking, deduction, and activation in a single transaction.
-- It is the source of truth for package activation logic.

CREATE OR REPLACE FUNCTION public.activate_package(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB AS $$
DECLARE
    v_balance NUMERIC;
    v_payment_id UUID;
BEGIN
    -- 1. Check wallet_balance from profiles table
    SELECT COALESCE(wallet_balance, 0) INTO v_balance FROM public.profiles WHERE id = p_user_id;
    
    IF v_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- 2. Deduct balance and activate package
    DECLARE
        v_rpc_result JSONB;
    BEGIN
        v_rpc_result := public.admin_add_payment_rpc(
            p_user_id::TEXT,
            p_amount::TEXT,
            'package_activation',
            'WALLET',
            'Package Activation: $' || p_amount::TEXT,
            'finished'
        );
        
        IF v_rpc_result->>'success' = 'false' THEN
            RETURN v_rpc_result;
        END IF;
        
        v_payment_id := (v_rpc_result->>'payment_id')::UUID;
    END;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Package activated successfully',
        'payment_id', v_payment_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.activate_package(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_package(UUID, NUMERIC) TO service_role;
