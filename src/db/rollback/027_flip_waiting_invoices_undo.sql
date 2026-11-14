-- src/db/rollback/027_flip_waiting_invoices_undo.sql
-- Undoes 027_flip_waiting_invoices.sql: puts the flipped jobs back to waiting.
-- A flipped job that was since given a paid_date by hand is left paid.
-- Back up the database first, and do a dry run on a database copy.

UPDATE job
SET invoice_status = 'waiting'
WHERE id IN (SELECT job_id FROM invoice_paid_flip)
  AND invoice_status = 'paid'
  AND paid_date IS NULL;
