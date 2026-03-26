-- Final fix for admin_add_payment_rpc to ensure type compatibility and parameter matching
-- This version uses TEXT for numeric inputs to avoid PostgREST type mismatch issues
-- and ensures all parameters are explicitly handled.

CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid TEXT, 
    p_amount TEXT, -- Changed to TEXT for better JS compatibility
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

    -- Directly update wallet balance to ensure it works even if trigger fails
    IF p_status = 'finished' OR p_status = 'completed' THEN
        IF p_type = 'deposit' THEN
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) + v_numeric_amount
            WHERE id = p_uid::UUID;
        ELSIF p_type = 'withdrawal' THEN
            UPDATE public.profiles 
            SET wallet_balance = COALESCE(wallet_balance, 0) - v_numeric_amount
            WHERE id = p_uid::UUID;
        END IF;
    END IF;

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

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
