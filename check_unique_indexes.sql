-- Check for unique constraints on the payments table using pg_class and pg_index
SELECT
    i.relname AS index_name,
    ix.indisunique AS is_unique,
    pg_get_indexdef(i.oid) AS index_definition
FROM
    pg_class t
JOIN
    pg_index ix ON t.oid = ix.indrelid
JOIN
    pg_class i ON ix.indexrelid = i.oid
WHERE
    t.relname = 'payments'
    AND ix.indisunique = true;
