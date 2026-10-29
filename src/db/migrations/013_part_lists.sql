-- src/db/migrations/013_part_lists.sql
-- Adds shared part lists and a source part on quote request lines.
-- Deleting a list removes its items.
--
-- Run manually against the production database after 012_quote_requests.sql
-- and BEFORE deploying the code that reads these tables,
-- after a dry run on a database copy.

CREATE TABLE part_list (
  id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_by_id VARCHAR(100) NOT NULL,
  created_by_name VARCHAR(100) NOT NULL,
  updated_by_id VARCHAR(100) NOT NULL,
  updated_by_name VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_part_list_company (company_id)
);

CREATE TABLE part_list_item (
  id INT NOT NULL AUTO_INCREMENT,
  list_id INT NOT NULL,
  part_id INT NOT NULL,
  added_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_part_list_item (list_id, part_id),
  FOREIGN KEY (list_id) REFERENCES part_list (id) ON DELETE CASCADE,
  FOREIGN KEY (part_id) REFERENCES part (id)
);

ALTER TABLE quote_request_line ADD COLUMN source_part_id INT NULL;
