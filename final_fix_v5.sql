-- 1. Drop all versions of admin_add_funds to fix the "Could not choose the best candidate" error
DROP FUNCTION IF EXISTS public.admin_add_funds(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_funds(UUID, NUMERIC);

-- 2. Recreate the correct version (TEXT, TEXT)
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

-- 3. Create helper function to check columns
CREATE OR REPLACE FUNCTION public.get_table_columns(p_table_name TEXT)
RETURNS TABLE(column_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT c.column_name::TEXT
    FROM information_schema.columns c
    WHERE c.table_name = p_table_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
