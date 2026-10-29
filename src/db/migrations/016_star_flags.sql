-- src/db/migrations/016_star_flags.sql
-- Urgent and Waiting stop being star statuses and become flags beside the
-- stage. Existing 'urgent' and 'waiting' stars become 'open' with the flag
-- set; all three map to in_shop, so clients see no change. Nothing is dropped.
--
-- Run manually against the production database after 015_star_status_history.sql
-- and BEFORE deploying the code that reads these columns.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE stars
  ADD COLUMN urgent TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN waiting TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE star_status_history
  ADD COLUMN kind ENUM('status','urgent','waiting') NOT NULL DEFAULT 'status';

UPDATE stars SET status = 'open', urgent = 1 WHERE status = 'urgent';

UPDATE stars SET status = 'open', waiting = 1 WHERE status = 'waiting';
