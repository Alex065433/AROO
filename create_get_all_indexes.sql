CREATE OR REPLACE FUNCTION public.get_all_indexes()
RETURNS TABLE(schemaname TEXT, tablename TEXT, indexname TEXT, indexdef TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.schemaname::TEXT,
        i.tablename::TEXT,
        i.indexname::TEXT,
        i.indexdef::TEXT
    FROM
        pg_indexes i
    WHERE
        i.schemaname = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
