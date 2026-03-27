-- List all tables and their constraints
SELECT
    t.table_name,
    c.constraint_name,
    c.constraint_type,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM
    information_schema.tables t
LEFT JOIN
    pg_constraint c
    ON t.table_name = c.conrelid::regclass::text
WHERE
    t.table_schema = 'public';
