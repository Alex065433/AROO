CREATE OR REPLACE FUNCTION public.search_constraints(p_pattern TEXT)
RETURNS TABLE(constraint_name TEXT, table_name TEXT, constraint_type TEXT, constraint_definition TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        conname::TEXT,
        conrelid::regclass::TEXT,
        contype::TEXT,
        pg_get_constraintdef(oid)::TEXT
    FROM
        pg_constraint
    WHERE
        conname LIKE p_pattern;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
