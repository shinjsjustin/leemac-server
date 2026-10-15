-- src/db/migrations/006_bourne_write_log.sql
-- Audit log for every Bourne write call, accepted or rejected.
--
-- Run manually against the production database after 005_prices_part_fields_job_files.sql
-- and before deploying the code that writes to it.
-- Rows never hold the key or file contents; request_summary is a small JSON digest only.

CREATE TABLE IF NOT EXISTS bourne_write_log (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  actor           VARCHAR(50) NULL,
  method          VARCHAR(10) NOT NULL,
  path            VARCHAR(255) NOT NULL,
  status          SMALLINT NOT NULL,
  accepted        TINYINT(1) NOT NULL,
  ip              VARCHAR(64) NULL,
  request_summary JSON NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bourne_write_log_created (created_at)
);
