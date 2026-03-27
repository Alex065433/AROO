CREATE OR REPLACE FUNCTION public.get_tables()
RETURNS TABLE(table_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT t.table_name::TEXT
    FROM information_schema.tables t
    WHERE t.table_schema = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
