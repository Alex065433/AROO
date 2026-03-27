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
