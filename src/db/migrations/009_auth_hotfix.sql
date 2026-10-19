-- src/db/migrations/009_auth_hotfix.sql
-- Disables admin rows, moves Foster (admin 6) and Santiago (admin 7) to client accounts,
-- and seeds a disabled author for client notes.
--
-- Run manually against the production database after 008_email_link.sql
-- and BEFORE deploying the code that reads admin.disabled.

ALTER TABLE admin ADD COLUMN disabled TINYINT(1) NOT NULL DEFAULT 0;

INSERT INTO clients (username, name, password, company_id)
SELECT email, name, password, company_id
FROM admin
WHERE ((id = 6 AND name LIKE '%Foster%') OR (id = 7 AND name LIKE '%Santiago%'))
  AND password IS NOT NULL
  AND company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.username = admin.email);

UPDATE admin SET disabled = 1,
  google_access_token = NULL,
  google_refresh_token = NULL
WHERE (id = 6 AND name LIKE '%Foster%') OR (id = 7 AND name LIKE '%Santiago%');

INSERT INTO admin (name, title, access_level, email, password, disabled)
SELECT 'Client portal', 'Client notes', 0, 'client-portal@leemac.invalid', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM admin WHERE email = 'client-portal@leemac.invalid');
