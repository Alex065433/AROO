CREATE OR REPLACE FUNCTION public.get_payments_indexes()
RETURNS TABLE(indexname TEXT, indexdef TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.indexname::TEXT,
        i.indexdef::TEXT
    FROM
        pg_indexes i
    WHERE
        i.tablename = 'payments'
        AND i.schemaname = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
