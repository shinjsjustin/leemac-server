-- src/db/migrations/011_trusted_device.sql
-- Adds the table of trusted admin browsers that may skip the second factor.
-- Only the sha256 hash of the device token is stored; the raw token stays in the browser.
--
-- Run manually against the production database after 010_login_security.sql
-- and BEFORE deploying the code that reads this table,
-- after a dry run on a database copy.

CREATE TABLE admin_trusted_device (
  id INT NOT NULL AUTO_INCREMENT,
  admin_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_admin_trusted_device_hash (token_hash),
  KEY idx_admin_trusted_device_admin (admin_id)
);
