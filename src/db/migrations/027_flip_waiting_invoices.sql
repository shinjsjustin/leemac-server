-- src/db/migrations/027_flip_waiting_invoices.sql
-- Marks every invoiced job still waiting as paid (about 215 are really paid),
-- with paid_date left NULL. The flipped job ids are saved in invoice_paid_flip
-- first, so the flip can be undone with src/db/rollback/027_flip_waiting_invoices_undo.sql.
-- Uninvoiced and already-paid jobs are untouched.
--
-- Run manually against the production database after 026_q4_2026_period.sql
-- and BEFORE deploying the code that relies on it.
-- Please back up the database first, and do a dry run on a database copy.

INSERT INTO invoice_paid_flip (job_id, flipped_at)
SELECT id, CURRENT_TIMESTAMP FROM job
WHERE invoice_status = 'waiting'
  AND invoice_number IS NOT NULL
  AND TRIM(invoice_number) <> '';

UPDATE job
SET invoice_status = 'paid', paid_date = NULL
WHERE id IN (SELECT job_id FROM invoice_paid_flip)
  AND invoice_status = 'waiting';
