-- src/db/migrations/012_quote_requests.sql
-- Adds client quote requests: the request, its part lines, and uploaded files.
-- Deleting a request removes its lines and files; deleting a line removes its files.
--
-- Run manually against the production database after 011_trusted_device.sql
-- and BEFORE deploying the code that reads these tables,
-- after a dry run on a database copy.

CREATE TABLE quote_request (
  id INT NOT NULL AUTO_INCREMENT,
  company_id VARCHAR(100) NOT NULL,
  client_id VARCHAR(100) NOT NULL,
  client_name VARCHAR(100) NOT NULL,
  name VARCHAR(100) NULL,
  need_by DATE NULL,
  note TEXT NULL,
  status ENUM('draft','sent','in_review','job_created') NOT NULL DEFAULT 'draft',
  job_id INT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_quote_request_company (company_id, status)
);

CREATE TABLE quote_request_line (
  id INT NOT NULL AUTO_INCREMENT,
  request_id INT NOT NULL,
  position INT NOT NULL,
  part_number VARCHAR(100) NULL,
  description VARCHAR(255) NULL,
  rev VARCHAR(10) NULL,
  material VARCHAR(100) NULL,
  finish VARCHAR(100) NULL,
  quantity INT NULL,
  price DECIMAL(10,2) NULL,
  part_id INT NULL,
  bourne_suggestion JSON NULL,
  PRIMARY KEY (id),
  KEY idx_quote_request_line_request (request_id),
  FOREIGN KEY (request_id) REFERENCES quote_request (id) ON DELETE CASCADE
);

CREATE TABLE quote_request_file (
  id INT NOT NULL AUTO_INCREMENT,
  request_id INT NOT NULL,
  line_id INT NULL,
  filename VARCHAR(255) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  content LONGBLOB NOT NULL,
  uploaded_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_quote_request_file_request (request_id),
  FOREIGN KEY (request_id) REFERENCES quote_request (id) ON DELETE CASCADE,
  FOREIGN KEY (line_id) REFERENCES quote_request_line (id) ON DELETE CASCADE
);
