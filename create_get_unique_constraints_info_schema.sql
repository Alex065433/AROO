CREATE OR REPLACE FUNCTION public.get_unique_constraints_info_schema(p_table_name TEXT)
RETURNS TABLE(constraint_name TEXT, table_name TEXT, column_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tc.constraint_name::TEXT,
        tc.table_name::TEXT,
        kcu.column_name::TEXT
    FROM
        information_schema.table_constraints AS tc
    JOIN
        information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE
        tc.constraint_type = 'UNIQUE'
        AND tc.table_name = p_table_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
