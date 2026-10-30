-- src/db/migrations/018_printing.sql
-- Adds printer, print_job and print_agent for the print queue, and seeds the
-- Brother letter printer and the thermal 4x6 label printer. Nothing existing
-- is changed or dropped.
--
-- Run manually against the production database after 017_admin_part_lists.sql
-- and BEFORE deploying the code that reads these tables.
-- Please back up the database first, and do a dry run on a database copy.

CREATE TABLE printer (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  cups_queue VARCHAR(100) NOT NULL,
  role ENUM('letter','label') NOT NULL,
  media VARCHAR(50) NOT NULL,
  copies JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE print_job (
  id INT NOT NULL AUTO_INCREMENT,
  file_id INT NOT NULL,
  printer_id INT NOT NULL,
  kind VARCHAR(20) NOT NULL,
  copies INT NOT NULL,
  options JSON DEFAULT NULL,
  status ENUM('queued','sent','printed','failed','expired') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  lp_job_id VARCHAR(100) DEFAULT NULL,
  error TEXT DEFAULT NULL,
  requested_by_id VARCHAR(255) NOT NULL,
  requested_by_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_print_job_status (status, created_at),
  FOREIGN KEY (file_id) REFERENCES uploaded_files (id) ON DELETE CASCADE,
  FOREIGN KEY (printer_id) REFERENCES printer (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE print_agent (
  id INT NOT NULL AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_print_agent_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO printer (name, cups_queue, role, media, copies) VALUES
  ('Brother', 'Brother_HL_L2305_series', 'letter', 'Letter',
   '{"quote":1,"order":1,"invoice":1,"packing":2,"shipping":1,"drawing":1,"file":1}');

INSERT INTO printer (name, cups_queue, role, media, copies) VALUES
  ('Thermal label', 'Printer_ThermalPrinter', 'label', '4x6',
   '{"quote":1,"order":1,"invoice":1,"packing":1,"shipping":1,"drawing":1,"file":1}');
