-- src/db/migrations/028_share_links.sql
-- Share links for client quotes (type 'quote', job_id set) and QC views
-- (type 'qc', part_id set). One row per link, with its expiry, turn-off time
-- and open count. Additive only; no existing table changes.
--
-- Run manually against the production database after 027_flip_waiting_invoices.sql
-- and BEFORE deploying the code that uses this table.
-- Please back up the database first, and do a dry run on a database copy.

CREATE TABLE share_link (
  id int NOT NULL AUTO_INCREMENT,
  type varchar(10) NOT NULL,
  token varchar(64) NOT NULL,
  job_id int DEFAULT NULL,
  part_id int DEFAULT NULL,
  company_id int NOT NULL,
  created_by_id varchar(255) NOT NULL,
  created_by_name varchar(255) NOT NULL,
  created_at datetime NOT NULL,
  expires_at datetime NOT NULL,
  turned_off_at datetime DEFAULT NULL,
  open_count int NOT NULL DEFAULT 0,
  last_opened_at datetime DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_share_link_token (token),
  KEY idx_share_link_job (type, job_id),
  KEY idx_share_link_part_company (type, part_id, company_id),
  FOREIGN KEY (job_id) REFERENCES job (id) ON DELETE CASCADE,
  FOREIGN KEY (part_id) REFERENCES part (id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
