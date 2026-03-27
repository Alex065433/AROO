CREATE OR REPLACE FUNCTION public.get_payments_constraints_v5()
RETURNS TABLE(constraint_name TEXT, constraint_type TEXT, constraint_definition TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        conname::TEXT,
        contype::TEXT,
        pg_get_constraintdef(oid)::TEXT
    FROM
        pg_constraint
    WHERE
        conrelid = 'public.payments'::regclass;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
