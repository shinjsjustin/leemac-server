-- src/db/migrations/020_document_leadtime_ship.sql
-- Adds job.leadtime and job.invoice_clicked_at (time of the latest
-- "Update invoice" click, used as the documents' ship date). Backfills
-- invoice_clicked_at from invoice_date so jobs invoiced before this change
-- can make shipping paperwork. leadtime stays NULL. Additive only.
--
-- Run manually against the production database after 019_job_documents.sql
-- and BEFORE deploying the code that reads these columns.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE job
  ADD COLUMN leadtime VARCHAR(64) NULL,
  ADD COLUMN invoice_clicked_at DATETIME NULL;

UPDATE job
SET invoice_clicked_at = invoice_date
WHERE invoice_clicked_at IS NULL AND invoice_date IS NOT NULL;
