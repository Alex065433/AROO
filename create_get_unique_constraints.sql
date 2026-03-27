CREATE OR REPLACE FUNCTION public.get_unique_constraints(p_table_name TEXT)
RETURNS TABLE(constraint_name TEXT, constraint_definition TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        conname::TEXT,
        pg_get_constraintdef(oid)::TEXT
    FROM
        pg_constraint
    WHERE
        conrelid = (p_table_name)::regclass
        AND contype = 'u';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
