-- List all tables and their constraints using pg_constraint and pg_class
SELECT
    c.relname AS table_name,
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM
    pg_class c
JOIN
    pg_constraint con ON c.oid = con.conrelid
WHERE
    c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
