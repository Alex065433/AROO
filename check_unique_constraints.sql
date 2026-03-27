-- Check for unique constraints on the payments table
SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM
    pg_constraint
WHERE
    conrelid = 'public.payments'::regclass
    AND contype = 'u';
