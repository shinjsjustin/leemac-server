-- src/db/migrations/021_expense_file.sql
-- Adds expense.file_id, the uploaded_files row holding the invoice PDF that
-- Bourne's expense write stores. Nullable; deleting the file clears it.
-- Additive only.
--
-- Run manually against the production database after 020_document_leadtime_ship.sql
-- and BEFORE deploying the code that writes this column.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE expense
  ADD COLUMN file_id INT NULL,
  ADD CONSTRAINT fk_expense_file FOREIGN KEY (file_id) REFERENCES uploaded_files (id) ON DELETE SET NULL;
