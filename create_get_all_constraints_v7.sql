CREATE OR REPLACE FUNCTION public.get_all_constraints_v7()
RETURNS TABLE(table_name TEXT, constraint_name TEXT, constraint_type TEXT, constraint_definition TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.relname::TEXT,
        con.conname::TEXT,
        con.contype::TEXT,
        pg_get_constraintdef(con.oid)::TEXT
    FROM
        pg_class c
    JOIN
        pg_constraint con ON c.oid = con.conrelid
    WHERE
        c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
