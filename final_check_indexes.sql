-- Final attempt to list all indexes
SELECT
    i.relname AS index_name,
    pg_get_indexdef(ix.indexrelid) AS index_definition
FROM
    pg_class t
JOIN
    pg_index ix ON t.oid = ix.indrelid
JOIN
    pg_class i ON ix.indexrelid = i.oid
WHERE
    t.relname = 'payments';
