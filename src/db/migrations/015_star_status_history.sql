-- src/db/migrations/015_star_status_history.sql
-- Records every star status change, with who made it (admin or NFC tag), so
-- the shop stage history can be shown later. There are no foreign keys so
-- the history survives an unstar. Nothing is backfilled.
--
-- Run manually against the production database after 014_client_notes.sql
-- and BEFORE deploying the code that writes this table.
-- Please back up the database first, and do a dry run on a database copy.

CREATE TABLE star_status_history (
  id INT NOT NULL AUTO_INCREMENT,
  job_part_id INT NOT NULL,
  job_id INT NOT NULL,
  company_id INT NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  source ENUM('admin','nfc') NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ssh_changed (changed_at),
  KEY idx_ssh_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
