-- Check for the constraint
SELECT conname
FROM pg_constraint
WHERE conname = 'payments_payment_id_key';
