CREATE OR REPLACE FUNCTION public.get_table_columns(p_table_name TEXT)
RETURNS TABLE(column_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT c.column_name::TEXT
    FROM information_schema.columns c
    WHERE c.table_name = p_table_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
