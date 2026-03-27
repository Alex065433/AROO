CREATE OR REPLACE FUNCTION public.get_unique_indexes(p_table_name TEXT)
RETURNS TABLE(index_name TEXT, is_unique BOOLEAN, index_definition TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.relname::TEXT,
        ix.indisunique,
        pg_get_indexdef(i.oid)::TEXT
    FROM
        pg_class t
    JOIN
        pg_index ix ON t.oid = ix.indrelid
    JOIN
        pg_class i ON ix.indexrelid = i.oid
    WHERE
        t.relname = p_table_name
        AND ix.indisunique = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
