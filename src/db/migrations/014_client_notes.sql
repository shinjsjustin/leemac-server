-- src/db/migrations/014_client_notes.sql
-- Lets notes belong to a part, records the client author, and adds a shared
-- flag so admin notes start private. Notes the client portal wrote through the
-- shared admin account get their company and author name backfilled.
--
-- Run manually against the production database after 013_part_lists.sql
-- and BEFORE deploying the code that reads these columns.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE note
  MODIFY jobid INT NULL,
  ADD part_id INT NULL,
  ADD company_id INT NULL,
  ADD client_id INT NULL,
  ADD client_name VARCHAR(100) NULL,
  ADD shared TINYINT(1) NOT NULL DEFAULT 0,
  ADD updated_at DATETIME NULL,
  ADD KEY idx_note_part (part_id),
  ADD KEY idx_note_company (company_id),
  ADD KEY idx_note_client (client_id),
  ADD FOREIGN KEY (part_id) REFERENCES part (id) ON DELETE CASCADE;

UPDATE note SET
  company_id = (SELECT company_id FROM job WHERE id = note.jobid),
  client_name = CASE WHEN LOCATE(': ', content) > 1
    THEN LEFT(LEFT(content, LOCATE(': ', content) - 1), 100)
    ELSE 'Client' END
WHERE userid IN (SELECT id FROM admin WHERE email = 'client-portal@leemac.invalid');

UPDATE note SET content = SUBSTRING(content, LOCATE(': ', content) + 2)
WHERE userid IN (SELECT id FROM admin WHERE email = 'client-portal@leemac.invalid')
  AND LOCATE(': ', content) > 1
  AND client_name = LEFT(LEFT(content, LOCATE(': ', content) - 1), 100);

UPDATE note SET client_id = (
  SELECT MIN(c.id) FROM clients c
  WHERE c.name = note.client_name AND c.company_id = note.company_id
)
WHERE userid IN (SELECT id FROM admin WHERE email = 'client-portal@leemac.invalid')
  AND (
    SELECT COUNT(*) FROM clients c
    WHERE c.name = note.client_name AND c.company_id = note.company_id
  ) = 1;
