CREATE OR REPLACE FUNCTION public.get_final_check_indexes()
RETURNS TABLE(index_name TEXT, index_definition TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.relname::TEXT,
        pg_get_indexdef(ix.indexrelid)::TEXT
    FROM
        pg_class t
    JOIN
        pg_index ix ON t.oid = ix.indrelid
    JOIN
        pg_class i ON ix.indexrelid = i.oid
    WHERE
        t.relname = 'payments';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
