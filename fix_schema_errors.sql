-- Fix admin_add_funds function
DROP FUNCTION IF EXISTS public.admin_add_funds(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_add_funds(
    p_uid UUID,
    p_amount NUMERIC
)
RETURNS JSONB AS $$
BEGIN
    RETURN public.admin_add_payment_rpc(
        p_uid::TEXT,
        p_amount::TEXT,
        'deposit',
        'ADMIN',
        'Funds added by administrator',
        'finished',
        'ADMIN_CREDIT_' || gen_random_uuid()::text,
        'usdtbsc',
        'Admin Credit'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix admin_add_payment_rpc to accept UUID and NUMERIC
DROP FUNCTION IF EXISTS public.admin_add_payment_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
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
RETURNS JSON AS $$
DECLARE
    v_payment_id UUID;
BEGIN
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
        order_id
    )
    VALUES (
        p_uid, 
        p_amount, 
        p_type, 
        p_status, 
        p_method, 
        p_description, 
        p_payment_id, 
        p_currency, 
        p_order_id
    );
    
    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add updated_at to profiles if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='updated_at') THEN
        ALTER TABLE public.profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
