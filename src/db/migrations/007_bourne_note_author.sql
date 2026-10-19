-- src/db/migrations/007_bourne_note_author.sql
-- Admin row that owns the job notes Bourne writes, since note.userid must reference an admin.
--
-- Run manually against the production database after 006_bourne_write_log.sql
-- and before deploying the code that writes notes.
-- The .invalid domain and NULL password mean nobody can log in as this row.

INSERT INTO admin (name, title, access_level, email, password)
SELECT 'Bourne', 'Assistant', 0, 'bourne@bourne.invalid', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM admin WHERE email = 'bourne@bourne.invalid'
);
