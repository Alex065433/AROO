CREATE OR REPLACE FUNCTION public.get_tables_pg()
RETURNS TABLE(tablename TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT t.tablename::TEXT
    FROM pg_tables t
    WHERE t.schemaname = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
