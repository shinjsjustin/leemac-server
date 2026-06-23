-- src/db/migrations/003_todo_title_description.sql
-- Splits the To Do list into a short title and an optional longer description.
--
-- The existing `content` column already holds a short summary, so it continues
-- to serve as the title (the API exposes it as `title`). This migration only
-- adds a nullable `description` column for the extra detail. No existing data
-- is altered or lost.
--
-- Run against the existing LeeMac database after 002_approval_verifier_fields.sql.

ALTER TABLE `ai_todos`
  ADD COLUMN `description` TEXT NULL DEFAULT NULL AFTER `content`;
