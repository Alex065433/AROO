CREATE OR REPLACE FUNCTION public.get_tables_constraints_v6()
RETURNS TABLE(table_name TEXT, constraint_name TEXT, constraint_type TEXT, constraint_definition TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.table_name::TEXT,
        c.conname::TEXT,
        c.contype::TEXT,
        pg_get_constraintdef(c.oid)::TEXT
    FROM
        information_schema.tables t
    LEFT JOIN
        pg_constraint c
        ON t.table_name = c.conrelid::regclass::text
    WHERE
        t.table_schema = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
