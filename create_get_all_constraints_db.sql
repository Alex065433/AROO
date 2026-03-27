CREATE OR REPLACE FUNCTION public.get_all_constraints_db()
RETURNS TABLE(constraint_name TEXT, table_name TEXT, constraint_type TEXT, constraint_definition TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        conname::TEXT,
        conrelid::regclass::TEXT,
        contype::TEXT,
        pg_get_constraintdef(oid)::TEXT
    FROM
        pg_constraint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
