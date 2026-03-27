CREATE OR REPLACE FUNCTION public.get_all_constraints_v3(p_table_name TEXT)
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
        conrelid = (p_table_name)::regclass;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
