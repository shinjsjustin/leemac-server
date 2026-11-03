-- src/db/migrations/022_job_no_bid.sql
-- Adds job.no_bid_at (when a quoted job was marked no-bid) and job.no_bid_by
-- (the admin id who marked it). Both nullable, no foreign key. Additive only.
--
-- Run manually against the production database after 021_expense_file.sql
-- and BEFORE deploying the code that uses these columns.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE job
  ADD COLUMN no_bid_at DATETIME NULL,
  ADD COLUMN no_bid_by INT NULL;
