-- src/db/migrations/010_login_security.sql
-- Adds the login-security tables (sessions, one-time tokens, backup codes),
-- lockout and TOTP columns on admin and clients, and a unique email on clients.
--
-- Run manually against the production database after 009_auth_hotfix.sql
-- and BEFORE deploying the code that reads these tables and columns,
-- after a dry run on a database copy.

CREATE TABLE auth_session (
  id CHAR(64) NOT NULL,
  user_type ENUM('admin','client') NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_auth_session_user (user_type, user_id)
);

CREATE TABLE auth_token (
  id INT NOT NULL AUTO_INCREMENT,
  purpose ENUM('invite','reset','verify_email') NOT NULL,
  user_type ENUM('admin','client') NOT NULL,
  user_id INT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100) NULL,
  company_id INT NULL,
  token_hash CHAR(64) NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_auth_token_hash (token_hash)
);

CREATE TABLE auth_backup_code (
  id INT NOT NULL AUTO_INCREMENT,
  user_type ENUM('admin','client') NOT NULL,
  user_id INT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_auth_backup_code_user (user_type, user_id)
);

ALTER TABLE admin
  ADD COLUMN email_verified_at DATETIME NULL,
  ADD COLUMN failed_logins INT NOT NULL DEFAULT 0,
  ADD COLUMN locked_until DATETIME NULL,
  ADD COLUMN totp_secret VARCHAR(255) NULL,
  ADD COLUMN totp_enabled_at DATETIME NULL,
  ADD COLUMN totp_last_step BIGINT NULL;

ALTER TABLE clients
  ADD COLUMN email_verified_at DATETIME NULL,
  ADD COLUMN failed_logins INT NOT NULL DEFAULT 0,
  ADD COLUMN locked_until DATETIME NULL,
  ADD COLUMN totp_secret VARCHAR(255) NULL,
  ADD COLUMN totp_enabled_at DATETIME NULL,
  ADD COLUMN totp_last_step BIGINT NULL,
  MODIFY email VARCHAR(255) NULL,
  ADD UNIQUE KEY uniq_clients_email (email),
  MODIFY username VARCHAR(255) NULL;

UPDATE clients SET email = LOWER(TRIM(username))
WHERE email IS NULL AND username LIKE '%_@_%._%';
