CREATE TABLE `stars` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_part_id` int NOT NULL,
  `attention` varchar(100) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'open',
  `urgent` tinyint(1) NOT NULL DEFAULT 0,
  `waiting` tinyint(1) NOT NULL DEFAULT 0,
  `nfc_tag_id` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_starred_job_part` (`job_part_id`),
  UNIQUE KEY `unique_nfc_tag` (`nfc_tag_id`),
  CONSTRAINT `fk_job_part_id` FOREIGN KEY (`job_part_id`) REFERENCES `job_part` (`id`) ON DELETE CASCADE
);

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
  `leadtime` varchar(64) DEFAULT NULL,
  `invoice_clicked_at` datetime DEFAULT NULL,
  `ship_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `attention` varchar(100) DEFAULT NULL,
  `total_cost` decimal(10,2) DEFAULT NULL,
  `subtotal` decimal(10,2) DEFAULT NULL,
  `invoice_status` enum('waiting','paid') DEFAULT 'waiting',
  `invoice_number_key` varchar(50) GENERATED ALWAYS AS (NULLIF(TRIM(`invoice_number`), '')) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `job_number` (`job_number`),
  UNIQUE KEY `uq_job_invoice_number` (`invoice_number_key`),
  KEY `company_id` (`company_id`),
  CONSTRAINT `job_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`)
);

CREATE TABLE `part` (
  `id` int NOT NULL AUTO_INCREMENT,
  `number` varchar(100) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `company` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `number` (`number`),
  KEY `company` (`company`),
  CONSTRAINT `part_ibfk_1` FOREIGN KEY (`company`) REFERENCES `company` (`id`)
);

CREATE TABLE `job_part` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_id` int NOT NULL,
  `part_id` int NOT NULL,
  `quantity` int DEFAULT '1',
  `price` decimal(10,2) DEFAULT NULL,
  `rev` varchar(10) DEFAULT NULL,
  `details` varchar(255) DEFAULT NULL,
  `note` text,
  `material` varchar(100) DEFAULT NULL,
  `finish` varchar(100) DEFAULT NULL,
  `stock_size` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `job_id` (`job_id`),
  KEY `part_id` (`part_id`),
  CONSTRAINT `job_part_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `job` (`id`),
  CONSTRAINT `job_part_ibfk_2` FOREIGN KEY (`part_id`) REFERENCES `part` (`id`)
);

CREATE TABLE `metadata` (
  `metakey` varchar(50) NOT NULL,
  `metavalue` json DEFAULT NULL,
  PRIMARY KEY (`metakey`)
);

CREATE TABLE `note` (
  `id` int NOT NULL AUTO_INCREMENT,
  `content` varchar(255) NOT NULL,
  `status` enum('new','acknowledged','done') NOT NULL DEFAULT 'new',
  `userid` int NOT NULL,
  `jobid` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `part_id` int DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `client_id` int DEFAULT NULL,
  `client_name` varchar(100) DEFAULT NULL,
  `shared` tinyint(1) NOT NULL DEFAULT '0',
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `userid` (`userid`),
  KEY `jobid` (`jobid`),
  KEY `idx_note_part` (`part_id`),
  KEY `idx_note_company` (`company_id`),
  KEY `idx_note_client` (`client_id`),
  CONSTRAINT `note_ibfk_1` FOREIGN KEY (`userid`) REFERENCES `admin` (`id`) ON DELETE CASCADE,
  CONSTRAINT `note_ibfk_2` FOREIGN KEY (`jobid`) REFERENCES `job` (`id`) ON DELETE CASCADE,
  CONSTRAINT `note_ibfk_3` FOREIGN KEY (`part_id`) REFERENCES `part` (`id`) ON DELETE CASCADE
);

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
  `disabled` tinyint(1) NOT NULL DEFAULT '0',
  `email_verified_at` datetime DEFAULT NULL,
  `failed_logins` int NOT NULL DEFAULT '0',
  `locked_until` datetime DEFAULT NULL,
  `totp_secret` varchar(255) DEFAULT NULL,
  `totp_enabled_at` datetime DEFAULT NULL,
  `totp_last_step` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `google_id` (`google_id`),
  KEY `fk_admin_company` (`company_id`),
  CONSTRAINT `fk_admin_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`)
);

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
);

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
);

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
);

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
);

CREATE TABLE `uploaded_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL,
  `mimetype` varchar(100) NOT NULL,
  `size` int NOT NULL,
  `content` longblob NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `part_id` int DEFAULT NULL,
  `note_id` int DEFAULT NULL,
  `job_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `part_id` (`part_id`),
  KEY `fk_note_file` (`note_id`),
  KEY `job_id` (`job_id`),
  CONSTRAINT `fk_note_file` FOREIGN KEY (`note_id`) REFERENCES `note` (`id`),
  CONSTRAINT `uploaded_files_ibfk_1` FOREIGN KEY (`part_id`) REFERENCES `part` (`id`),
  CONSTRAINT `uploaded_files_ibfk_2` FOREIGN KEY (`job_id`) REFERENCES `job` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


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

CREATE TABLE `bourne_write_log` (
  `id`              int NOT NULL AUTO_INCREMENT,
  `actor`           varchar(50) NULL,
  `method`          varchar(10) NOT NULL,
  `path`            varchar(255) NOT NULL,
  `status`          smallint NOT NULL,
  `accepted`        tinyint(1) NOT NULL,
  `ip`              varchar(64) NULL,
  `request_summary` json NULL,
  `created_at`      timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bourne_write_log_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `email_link` (
  `id`           int NOT NULL AUTO_INCREMENT,
  `job_id`       int NULL,
  `part_id`      int NULL,
  `message_id`   varchar(255) NOT NULL,
  `subject`      varchar(255) NULL,
  `from_address` varchar(255) NULL,
  `sent_at`      datetime NOT NULL,
  `created_by`   varchar(50) NOT NULL,
  `created_at`   timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email_link_job` (`job_id`, `message_id`),
  UNIQUE KEY `uq_email_link_part` (`part_id`, `message_id`),
  FOREIGN KEY (`job_id`) REFERENCES `job` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`part_id`) REFERENCES `part` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `auth_session` (
  `id` char(64) NOT NULL,
  `user_type` enum('admin','client') NOT NULL,
  `user_id` int NOT NULL,
  `created_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_auth_session_user` (`user_type`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `auth_token` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purpose` enum('invite','reset','verify_email') NOT NULL,
  `user_type` enum('admin','client') NOT NULL,
  `user_id` int DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `token_hash` char(64) NOT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_auth_token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `auth_backup_code` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_type` enum('admin','client') NOT NULL,
  `user_id` int NOT NULL,
  `code_hash` char(64) NOT NULL,
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_auth_backup_code_user` (`user_type`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `admin_trusted_device` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_id` int NOT NULL,
  `token_hash` char(64) NOT NULL,
  `label` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  `last_used_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_admin_trusted_device_hash` (`token_hash`),
  KEY `idx_admin_trusted_device_admin` (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `quote_request` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` varchar(100) NOT NULL,
  `client_id` varchar(100) NOT NULL,
  `client_name` varchar(100) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `need_by` date DEFAULT NULL,
  `note` text DEFAULT NULL,
  `status` enum('draft','sent','in_review','job_created') NOT NULL DEFAULT 'draft',
  `job_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_quote_request_company` (`company_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `quote_request_line` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `position` int NOT NULL,
  `part_number` varchar(100) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `rev` varchar(10) DEFAULT NULL,
  `material` varchar(100) DEFAULT NULL,
  `finish` varchar(100) DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `part_id` int DEFAULT NULL,
  `bourne_suggestion` json DEFAULT NULL,
  `source_part_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_quote_request_line_request` (`request_id`),
  FOREIGN KEY (`request_id`) REFERENCES `quote_request` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `quote_request_file` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `line_id` int DEFAULT NULL,
  `filename` varchar(255) NOT NULL,
  `mimetype` varchar(100) NOT NULL,
  `size` int NOT NULL,
  `content` longblob NOT NULL,
  `uploaded_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_quote_request_file_request` (`request_id`),
  FOREIGN KEY (`request_id`) REFERENCES `quote_request` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`line_id`) REFERENCES `quote_request_line` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `part_list` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_by_id` varchar(100) NOT NULL,
  `created_by_name` varchar(100) NOT NULL,
  `updated_by_id` varchar(100) NOT NULL,
  `updated_by_name` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_part_list_company` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `part_list_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `list_id` int NOT NULL,
  `part_id` int NOT NULL,
  `added_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_part_list_item` (`list_id`,`part_id`),
  FOREIGN KEY (`list_id`) REFERENCES `part_list` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`part_id`) REFERENCES `part` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `admin_part_list` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `created_by_id` varchar(255) NOT NULL,
  `created_by_name` varchar(255) NOT NULL,
  `updated_by_id` varchar(255) NOT NULL,
  `updated_by_name` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `admin_part_list_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `list_id` int NOT NULL,
  `part_id` int NOT NULL,
  `added_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_part_list_item` (`list_id`,`part_id`),
  FOREIGN KEY (`list_id`) REFERENCES `admin_part_list` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`part_id`) REFERENCES `part` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `printer` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `cups_queue` varchar(100) NOT NULL,
  `role` enum('letter','label') NOT NULL,
  `media` varchar(50) NOT NULL,
  `copies` json NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `print_job` (
  `id` int NOT NULL AUTO_INCREMENT,
  `file_id` int NOT NULL,
  `printer_id` int NOT NULL,
  `kind` varchar(20) NOT NULL,
  `copies` int NOT NULL,
  `options` json DEFAULT NULL,
  `status` enum('queued','sent','printed','failed','expired') NOT NULL DEFAULT 'queued',
  `attempts` int NOT NULL DEFAULT 0,
  `lp_job_id` varchar(100) DEFAULT NULL,
  `error` text DEFAULT NULL,
  `requested_by_id` varchar(255) NOT NULL,
  `requested_by_name` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `claimed_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_print_job_status` (`status`,`created_at`),
  FOREIGN KEY (`file_id`) REFERENCES `uploaded_files` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`printer_id`) REFERENCES `printer` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `print_agent` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token_hash` char(64) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_print_agent_token` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `job_document` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_id` int NOT NULL,
  `type` enum('quote','order','invoice','packing','shipping') NOT NULL,
  `fields` json NOT NULL,
  `parts` json NOT NULL,
  `file_id` int DEFAULT NULL,
  `saved_by_id` varchar(255) DEFAULT NULL,
  `saved_by_name` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `saved_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_document` (`job_id`,`type`),
  FOREIGN KEY (`job_id`) REFERENCES `job` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`file_id`) REFERENCES `uploaded_files` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `star_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_part_id` int NOT NULL,
  `job_id` int NOT NULL,
  `company_id` int NOT NULL,
  `from_status` varchar(20) DEFAULT NULL,
  `to_status` varchar(20) NOT NULL,
  `source` enum('admin','nfc') NOT NULL,
  `kind` enum('status','urgent','waiting') NOT NULL DEFAULT 'status',
  `changed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ssh_changed` (`changed_at`),
  KEY `idx_ssh_company` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
