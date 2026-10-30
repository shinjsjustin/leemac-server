-- src/db/migrations/019_job_documents.sql
-- Adds job_document for saved quote/order/invoice/packing/shipping documents,
-- and job.invoice_number_key so invoice numbers are unique. Blank and NULL
-- invoice numbers stay allowed. Nothing existing is dropped.
--
-- Run manually against the production database after 018_printing.sql
-- and BEFORE deploying the code that reads these tables.
-- Please back up the database first, and do a dry run on a database copy.
--
-- Run this pre-check first. It must return no rows, or the unique key fails:
-- SELECT TRIM(invoice_number) AS invoice_number, COUNT(*) AS jobs
-- FROM job
-- WHERE NULLIF(TRIM(invoice_number), '') IS NOT NULL
-- GROUP BY TRIM(invoice_number)
-- HAVING COUNT(*) > 1;

CREATE TABLE job_document (
  id INT NOT NULL AUTO_INCREMENT,
  job_id INT NOT NULL,
  type ENUM('quote','order','invoice','packing','shipping') NOT NULL,
  fields JSON NOT NULL,
  parts JSON NOT NULL,
  file_id INT NULL,
  saved_by_id VARCHAR(255) DEFAULT NULL,
  saved_by_name VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_job_document (job_id, type),
  FOREIGN KEY (job_id) REFERENCES job (id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES uploaded_files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE job
  ADD COLUMN invoice_number_key VARCHAR(50) GENERATED ALWAYS AS (NULLIF(TRIM(invoice_number), '')) STORED,
  ADD UNIQUE KEY uq_job_invoice_number (invoice_number_key);
