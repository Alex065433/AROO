-- admin_fund_fix_v2.sql
-- COMPLETE CLEAN FIX for Admin Fund Addition

-- 1. CLEANUP: Remove all confusing/duplicate/incorrect functions
DROP FUNCTION IF EXISTS public.add_funds(uuid, numeric);
DROP FUNCTION IF EXISTS public.add_income(text, numeric);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(text, numeric, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.update_user_wallet(uuid, numeric);

-- 2. CREATE: Single correct function for admin fund addition
-- This function follows the user's exact logic: Add to total_income and wallet_balance.
CREATE OR REPLACE FUNCTION public.admin_add_funds(
    p_user_id UUID,
    p_amount NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_new_balance NUMERIC;
BEGIN
    -- Update the profile: Add to both wallet_balance and total_income
    UPDATE public.profiles
    SET 
        wallet_balance = COALESCE(wallet_balance, 0) + p_amount,
        total_income = COALESCE(total_income, 0) + p_amount,
        -- Ensure JSONB wallet is also updated for consistency
        wallets = jsonb_set(
            COALESCE(wallets, '{"master": {"balance": 0}}'::jsonb),
            '{master, balance}',
            to_jsonb((COALESCE(wallets->'master'->>'balance', '0'))::numeric + p_amount)
        ),
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING wallet_balance INTO v_new_balance;

    -- Log the transaction in the payments table
    INSERT INTO public.payments (uid, amount, type, status, method, order_description, created_at)
    VALUES (p_user_id, p_amount, 'admin_deposit', 'finished', 'ADMIN', 'Admin added funds', NOW());

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. CREATE: Correct internal payment RPC (using UUID and NUMERIC)
-- This is used for automated processes like weekly income and node collection.
CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid UUID,
    p_amount NUMERIC,
    p_type TEXT,
    p_method TEXT,
    p_description TEXT,
    p_status TEXT DEFAULT 'finished',
    p_payment_id TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'usdtbsc',
    p_order_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_payment_id UUID;
BEGIN
    INSERT INTO public.payments (
        uid, amount, type, status, method, order_description, payment_id, currency, order_id, created_at
    )
    VALUES (
        p_uid, p_amount, p_type, p_status, p_method, p_description, p_payment_id, p_currency, p_order_id, NOW()
    )
    RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. PERMISSIONS
GRANT EXECUTE ON FUNCTION public.admin_add_funds(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
