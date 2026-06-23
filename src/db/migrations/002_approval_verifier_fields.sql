-- src/db/migrations/002_approval_verifier_fields.sql
-- Adds creator/verifier (Bezalel/Moses) outcome fields to the Requests queue.
--
-- These columns carry the verification verdict produced BEFORE the human
-- approval gate. They are purely informational: a failed-verification row is
-- still fully approvable by the owner. No existing column is altered and no
-- business-data schema changes.
--
-- Run against the existing LeeMac database after 001_jarvis_tables.sql.

ALTER TABLE `ai_approvals`
  ADD COLUMN `verifier_status` VARCHAR(20) NULL DEFAULT NULL AFTER `status`,
  ADD COLUMN `verifier_notes`  JSON        NULL DEFAULT NULL AFTER `verifier_status`;

-- Existing rows predate verification. New nullable columns already default to
-- NULL for them; this makes the backfill explicit and idempotent.
UPDATE `ai_approvals`
   SET `verifier_status` = NULL,
       `verifier_notes`  = NULL
 WHERE `verifier_status` IS NOT NULL
    OR `verifier_notes`  IS NOT NULL;
