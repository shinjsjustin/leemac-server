-- src/db/migrations/024_qc_markings.sql
-- QC markings on part drawings. Creates qc_marking (a point, line or box on one
-- drawing page, by Leemac when company_id is NULL or by a client company),
-- qc_photo (photos attached to a marking from a job) and qc_ping (one row per
-- part and company). Coordinates are fractions 0-1 of the full untrimmed page.
-- Additive only; no existing table changes.
--
-- Run manually against the production database after 023_shared_part_lists.sql
-- and BEFORE deploying the code that uses these tables.
-- Please back up the database first, and do a dry run on a database copy.

CREATE TABLE qc_marking (
  id INT NOT NULL AUTO_INCREMENT,
  part_id INT NOT NULL,
  file_id INT NOT NULL,
  page INT NOT NULL,
  company_id INT NULL,
  kind VARCHAR(10) NOT NULL,
  x1 DOUBLE NOT NULL,
  y1 DOUBLE NOT NULL,
  x2 DOUBLE NULL,
  y2 DOUBLE NULL,
  size DOUBLE NULL,
  note VARCHAR(255) NULL,
  author_id VARCHAR(255) NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_qc_marking_part (part_id, file_id),
  FOREIGN KEY (part_id) REFERENCES part (id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES uploaded_files (id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE qc_photo (
  id INT NOT NULL AUTO_INCREMENT,
  marking_id INT NOT NULL,
  job_id INT NOT NULL,
  position INT NOT NULL,
  value VARCHAR(64) NULL,
  caption VARCHAR(255) NULL,
  mimetype VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  content MEDIUMBLOB NOT NULL,
  uploaded_by_name VARCHAR(255) NOT NULL,
  uploaded_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_qc_photo_marking (marking_id),
  FOREIGN KEY (marking_id) REFERENCES qc_marking (id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES job (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE qc_ping (
  id INT NOT NULL AUTO_INCREMENT,
  part_id INT NOT NULL,
  company_id INT NOT NULL,
  pinged_by_name VARCHAR(255) NOT NULL,
  pinged_at DATETIME NOT NULL,
  ping_count INT NOT NULL,
  dismissed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_qc_ping (part_id, company_id),
  FOREIGN KEY (part_id) REFERENCES part (id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
