-- src/db/migrations/001_jarvis_tables.sql
-- Jarvis AI system tables
-- Run against the existing LeeMac database.
-- Prerequisites: uploaded_files table must already exist (referenced by ai_approvals).

-- ─────────────────────────────────────────────
-- 1. ai_sessions — one row per daily AI session
-- ─────────────────────────────────────────────
CREATE TABLE `ai_sessions` (
  `id`               int NOT NULL AUTO_INCREMENT,
  `session_date`     date NOT NULL,
  `status`           enum('open','closed') NOT NULL DEFAULT 'open',
  `context_summary`  text DEFAULT NULL,           -- compressed narrative injected next morning
  `opened_at`        timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at`        timestamp NULL DEFAULT NULL,
  `created_at`       timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_date` (`session_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────────
-- 2. ai_messages — every message exchanged within a session
-- ──────────────────────────────────────────────────────────────
CREATE TABLE `ai_messages` (
  `id`           int NOT NULL AUTO_INCREMENT,
  `session_id`   int NOT NULL,
  `role`         enum('user','assistant','system') NOT NULL,
  `content`      longtext NOT NULL,
  `message_type` enum('chat','proactive','morning_brief','eod') NOT NULL DEFAULT 'chat',
  `created_at`   timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_messages_session` (`session_id`),
  CONSTRAINT `ai_messages_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `ai_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. ai_memory — durable facts that survive session wipes
--    fact_hash is SHA-256 (or similar) of the normalised fact text, used for dedup
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE `ai_memory` (
  `id`                int NOT NULL AUTO_INCREMENT,
  `category`          enum('client_preference','job_pattern','operational_note','business_context') NOT NULL,
  `fact`              text NOT NULL,
  `fact_hash`         varchar(64) NOT NULL,        -- hex digest of normalised fact; enforces dedup
  `source_session_id` int DEFAULT NULL,
  `created_at`        timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fact_hash` (`fact_hash`),
  KEY `idx_ai_memory_session` (`source_session_id`),
  CONSTRAINT `ai_memory_ibfk_1` FOREIGN KEY (`source_session_id`) REFERENCES `ai_sessions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ai_uploads — temp staging for files uploaded in chat before approval
--    On approval, content is copied to uploaded_files and this row → 'promoted'.
--    Created before ai_approvals because ai_approvals holds a FK to this table.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `ai_uploads` (
  `id`         int NOT NULL AUTO_INCREMENT,
  `filename`   varchar(255) NOT NULL,
  `mimetype`   varchar(50) NOT NULL,
  `size`       int NOT NULL,
  `content`    longblob NOT NULL,
  `session_id` int DEFAULT NULL,
  `status`     enum('staged','promoted','discarded') NOT NULL DEFAULT 'staged',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_uploads_session` (`session_id`),
  CONSTRAINT `ai_uploads_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `ai_sessions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────────────────
-- 5. ai_approvals — Requests queue; AI proposes, human approves/rejects
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE `ai_approvals` (
  `id`                 int NOT NULL AUTO_INCREMENT,
  `title`              varchar(255) NOT NULL,
  `description`        text NOT NULL,              -- human-readable summary of proposed action
  `request_payload`    json NOT NULL,              -- structured action: endpoint, method, body
  `status`             enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `rejection_reason`   text DEFAULT NULL,
  `linked_upload_id`   int DEFAULT NULL,           -- optional staged file involved in this action
  `created_at`         timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at`        timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ai_approvals_status` (`status`),
  KEY `idx_ai_approvals_upload` (`linked_upload_id`),
  CONSTRAINT `ai_approvals_ibfk_1` FOREIGN KEY (`linked_upload_id`) REFERENCES `ai_uploads` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────────────────
-- 6. ai_tool_log — immutable audit trail of every tool the AI invoked
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE `ai_tool_log` (
  `id`          int NOT NULL AUTO_INCREMENT,
  `session_id`  int DEFAULT NULL,
  `tool_name`   varchar(100) NOT NULL,
  `tool_input`  json NOT NULL,
  `tool_output` json DEFAULT NULL,
  `success`     tinyint(1) NOT NULL DEFAULT 1,
  `created_at`  timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_tool_log_session` (`session_id`),
  CONSTRAINT `ai_tool_log_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `ai_sessions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────────────────
-- 7. ai_notifications — proactive items the AI wants to surface
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE `ai_notifications` (
  `id`          int NOT NULL AUTO_INCREMENT,
  `type`        varchar(50) NOT NULL,              -- e.g. 'email_summary', 'alert'
  `content`     text NOT NULL,
  `read_status` tinyint(1) NOT NULL DEFAULT 0,
  `created_at`  timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_notifications_read` (`read_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────────────────
-- 8. ai_todos — the To Do list (AI-generated or user-entered)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE `ai_todos` (
  `id`         int NOT NULL AUTO_INCREMENT,
  `content`    varchar(500) NOT NULL,
  `source`     enum('ai','user') NOT NULL DEFAULT 'user',
  `done`       tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `done_at`    timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
