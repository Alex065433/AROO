-- List all constraints for all tables
SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM
    pg_constraint
WHERE
    conname LIKE '%payment%';
