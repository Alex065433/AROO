-- List all tables and their constraints
SELECT
    t.table_name,
    c.constraint_name,
    c.constraint_type
FROM
    information_schema.tables t
LEFT JOIN
    information_schema.table_constraints c
    ON t.table_name = c.table_name
WHERE
    t.table_schema = 'public';
