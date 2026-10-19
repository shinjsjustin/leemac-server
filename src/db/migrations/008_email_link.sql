-- src/db/migrations/008_email_link.sql
-- Pointer from a job or part to an email, so staff can find the message in their mailbox.
--
-- Run manually against the production database after 007_bourne_note_author.sql
-- and before deploying the code that writes email links.
-- Stores a pointer only, never a message body or attachment.
-- No CHECK constraint: MySQL rejects CHECK on columns used by cascading foreign keys,
-- so the app enforces that exactly one of job_id or part_id is set.

CREATE TABLE IF NOT EXISTS email_link (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  job_id       INT NULL,
  part_id      INT NULL,
  message_id   VARCHAR(255) NOT NULL,  -- Message-ID without angle brackets
  subject      VARCHAR(255) NULL,
  from_address VARCHAR(255) NULL,
  sent_at      DATETIME NOT NULL,
  created_by   VARCHAR(50) NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_link_job (job_id, message_id),
  UNIQUE KEY uq_email_link_part (part_id, message_id),
  FOREIGN KEY (job_id) REFERENCES job(id) ON DELETE CASCADE,
  FOREIGN KEY (part_id) REFERENCES part(id) ON DELETE CASCADE
);
