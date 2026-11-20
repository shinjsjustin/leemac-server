-- src/db/migrations/029_notes_process_steps.sql
-- Adds part.process_steps (the Process Steps field) and drops expense_job.notes,
-- which nothing reads after this change. The drop deletes that column's data.
--
-- Run manually against the production database after 028_share_links.sql
-- and right before deploying the code that uses process_steps.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE part ADD COLUMN process_steps text DEFAULT NULL;

ALTER TABLE expense_job DROP COLUMN notes;
