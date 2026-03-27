-- List all indexes on the payments table
SELECT
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    tablename = 'payments'
    AND schemaname = 'public';
