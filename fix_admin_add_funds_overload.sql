-- Drop all versions of admin_add_funds
DROP FUNCTION IF EXISTS public.admin_add_funds(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_funds(UUID, NUMERIC);

-- Recreate the correct version (TEXT, TEXT)
CREATE OR REPLACE FUNCTION public.admin_add_funds(
    p_uid TEXT,
    p_amount TEXT
)
RETURNS JSONB AS $$
BEGIN
    RETURN public.admin_add_payment_rpc(
        p_uid,
        p_amount,
        'deposit',
        'ADMIN_CREDIT',
        'ADMIN',
        'Funds added by administrator',
        'finished',
        'usdtbsc',
        'Admin Credit'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
