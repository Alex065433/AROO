-- List all tables using pg_tables
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public';
