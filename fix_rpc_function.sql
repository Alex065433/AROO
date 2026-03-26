-- Fix admin_add_payment_rpc function signature and types
CREATE OR REPLACE FUNCTION public.admin_add_payment_rpc(
    p_uid TEXT, 
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
    -- Ensure p_uid is a valid UUID before inserting
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
        p_amount, 
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
    
    RETURN jsonb_build_object('id', v_payment_id, 'success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM, 'success', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
