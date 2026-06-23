CREATE TABLE `stars` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_part_id` int NOT NULL,
  `attention` varchar(100) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'open',
  `nfc_tag_id` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_starred_job_part` (`job_part_id`),
  UNIQUE KEY `unique_nfc_tag` (`nfc_tag_id`),
  CONSTRAINT `fk_job_part_id` FOREIGN KEY (`job_part_id`) REFERENCES `job_part` (`id`) ON DELETE CASCADE
) 

CREATE TABLE `job` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_number` varchar(20) NOT NULL,
  `company_id` int NOT NULL,
  `po_number` varchar(50) DEFAULT NULL,
  `po_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `tax_code` tinyint(1) DEFAULT NULL,
  `tax` decimal(10,2) DEFAULT NULL,
  `tax_percent` decimal(5,2) DEFAULT NULL,
  `invoice_number` varchar(50) DEFAULT NULL,
  `invoice_date` date DEFAULT NULL,
  `ship_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `attention` varchar(100) DEFAULT NULL,
  `total_cost` int DEFAULT NULL,
  `subtotal` int DEFAULT NULL,
  `invoice_status` enum('waiting','paid') DEFAULT 'waiting',
  PRIMARY KEY (`id`),
  UNIQUE KEY `job_number` (`job_number`),
  KEY `company_id` (`company_id`),
  CONSTRAINT `job_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`)
)

CREATE TABLE `part` (
  `id` int NOT NULL AUTO_INCREMENT,
  `number` varchar(100) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `company` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `number` (`number`),
  KEY `company` (`company`),
  CONSTRAINT `part_ibfk_1` FOREIGN KEY (`company`) REFERENCES `company` (`id`)
)

CREATE TABLE `job_part` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_id` int NOT NULL,
  `part_id` int NOT NULL,
  `quantity` int DEFAULT '1',
  `price` int DEFAULT NULL,
  `rev` varchar(10) DEFAULT NULL,
  `details` varchar(50) DEFAULT NULL,
  `note` text,
  PRIMARY KEY (`id`),
  KEY `job_id` (`job_id`),
  KEY `part_id` (`part_id`),
  CONSTRAINT `job_part_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `job` (`id`),
  CONSTRAINT `job_part_ibfk_2` FOREIGN KEY (`part_id`) REFERENCES `part` (`id`)
)

CREATE TABLE `metadata` (
  `metakey` varchar(50) NOT NULL,
  `metavalue` json DEFAULT NULL,
  PRIMARY KEY (`metakey`)
)

CREATE TABLE `note` (
  `id` int NOT NULL AUTO_INCREMENT,
  `content` varchar(255) NOT NULL,
  `status` enum('new','acknowledged','done') NOT NULL DEFAULT 'new',
  `userid` int NOT NULL,
  `jobid` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `userid` (`userid`),
  KEY `jobid` (`jobid`),
  CONSTRAINT `note_ibfk_1` FOREIGN KEY (`userid`) REFERENCES `admin` (`id`) ON DELETE CASCADE,
  CONSTRAINT `note_ibfk_2` FOREIGN KEY (`jobid`) REFERENCES `job` (`id`) ON DELETE CASCADE
)

CREATE TABLE `admin` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `title` varchar(100) NOT NULL,
  `access_level` int NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `google_id` varchar(255) DEFAULT NULL,
  `profile_picture` varchar(500) DEFAULT NULL,
  `google_access_token` text,
  `google_refresh_token` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `google_id` (`google_id`),
  KEY `fk_admin_company` (`company_id`),
  CONSTRAINT `fk_admin_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`)
)

CREATE TABLE `expense` (
  `id` int NOT NULL AUTO_INCREMENT,
  `description` varchar(255) NOT NULL,
  `vendor` varchar(100) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `expense_date` date NOT NULL,
  `category` varchar(50) DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
)

CREATE TABLE `expense_job` (
  `id` int NOT NULL AUTO_INCREMENT,
  `expense_id` int NOT NULL,
  `job_id` int NOT NULL,
  `notes` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_expense_job` (`expense_id`,`job_id`),
  KEY `job_id` (`job_id`),
  CONSTRAINT `expense_job_ibfk_1` FOREIGN KEY (`expense_id`) REFERENCES `expense` (`id`) ON DELETE CASCADE,
  CONSTRAINT `expense_job_ibfk_2` FOREIGN KEY (`job_id`) REFERENCES `job` (`id`) ON DELETE CASCADE
)

CREATE TABLE `expense_financial_period` (
  `id` int NOT NULL AUTO_INCREMENT,
  `expense_id` int NOT NULL,
  `financial_period_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_expense_period` (`expense_id`,`financial_period_id`),
  KEY `fk_efp_financial_period` (`financial_period_id`),
  CONSTRAINT `fk_efp_expense` FOREIGN KEY (`expense_id`) REFERENCES `expense` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_efp_financial_period` FOREIGN KEY (`financial_period_id`) REFERENCES `financial_period` (`id`) ON DELETE CASCADE
)

CREATE TABLE `financial_period` (
  `id` int NOT NULL AUTO_INCREMENT,
  `lable` varchar(20) NOT NULL,
  `quarter` tinyint NOT NULL,
  `year` year NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_period` (`quarter`,`year`)
)

CREATE TABLE `uploaded_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL,
  `mimetype` varchar(50) NOT NULL,
  `size` int NOT NULL,
  `content` longblob NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `part_id` int DEFAULT NULL,
  `note_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `part_id` (`part_id`),
  KEY `fk_note_file` (`note_id`),
  CONSTRAINT `fk_note_file` FOREIGN KEY (`note_id`) REFERENCES `note` (`id`),
  CONSTRAINT `uploaded_files_ibfk_1` FOREIGN KEY (`part_id`) REFERENCES `part` (`id`)
)


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
  `content`    varchar(500) NOT NULL,           -- short title / summary of the task
  `description` text DEFAULT NULL,              -- optional longer detail
  `source`     enum('ai','user') NOT NULL DEFAULT 'user',
  `done`       tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `done_at`    timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
