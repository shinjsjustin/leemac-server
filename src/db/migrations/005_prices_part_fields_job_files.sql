-- src/db/migrations/005_prices_part_fields_job_files.sql
-- Stores prices with cents, gives job parts material / finish / stock size fields,
-- and lets uploaded files attach directly to a job.
--
-- Additive only: INT to DECIMAL(10,2) keeps whole-dollar prices exact, new columns
-- are nullable, and no data is updated, so old clients keep working.
--
-- Run manually against the production LeeMac database after 004_ai_usage.sql,
-- before deploying this code.

ALTER TABLE job_part
  MODIFY COLUMN price DECIMAL(10,2) DEFAULT NULL,
  MODIFY COLUMN details VARCHAR(255) DEFAULT NULL,
  ADD COLUMN material VARCHAR(100) DEFAULT NULL,
  ADD COLUMN finish VARCHAR(100) DEFAULT NULL,
  ADD COLUMN stock_size VARCHAR(100) DEFAULT NULL;

ALTER TABLE job
  MODIFY COLUMN subtotal DECIMAL(10,2) DEFAULT NULL,
  MODIFY COLUMN total_cost DECIMAL(10,2) DEFAULT NULL;

ALTER TABLE uploaded_files
  MODIFY COLUMN mimetype VARCHAR(100) NOT NULL,
  ADD COLUMN job_id INT DEFAULT NULL,
  ADD KEY job_id (job_id),
  ADD CONSTRAINT uploaded_files_ibfk_2 FOREIGN KEY (job_id) REFERENCES job (id);
