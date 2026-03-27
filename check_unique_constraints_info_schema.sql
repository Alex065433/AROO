-- Check for unique constraints on the payments table using information_schema
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name
FROM
    information_schema.table_constraints AS tc
JOIN
    information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE
    tc.constraint_type = 'UNIQUE'
    AND tc.table_name = 'payments';
