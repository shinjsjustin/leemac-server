-- src/db/migrations/025_invoice_paid_date.sql
-- Adds job.paid_date (the date an invoice was paid, nullable) and creates
-- invoice_paid_flip, which saves the job ids a bulk paid flip changed so the
-- flip can be undone. No foreign key, so undo survives job deletes.
-- Additive only; nothing is dropped or deleted.
--
-- Run manually against the production database after 024_qc_markings.sql
-- and BEFORE deploying the code that uses these columns.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE job
  ADD COLUMN paid_date DATE NULL;

CREATE TABLE invoice_paid_flip (
  id INT NOT NULL AUTO_INCREMENT,
  job_id INT NOT NULL,
  flipped_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_invoice_paid_flip_job (job_id)
) ENGINE=InnoDB;
