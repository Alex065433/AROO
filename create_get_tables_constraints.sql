CREATE OR REPLACE FUNCTION public.get_tables_constraints()
RETURNS TABLE(table_name TEXT, constraint_name TEXT, constraint_type TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.table_name::TEXT,
        c.constraint_name::TEXT,
        c.constraint_type::TEXT
    FROM
        information_schema.tables t
    LEFT JOIN
        information_schema.table_constraints c
        ON t.table_name = c.table_name
    WHERE
        t.table_schema = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
