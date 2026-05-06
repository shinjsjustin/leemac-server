CREATE TABLE `stars` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_id` int NOT NULL,
  `attention` varchar(100) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'open',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_starred_job` (`job_id`),
  CONSTRAINT `fk_job_id` FOREIGN KEY (`job_id`) REFERENCES `job` (`id`) ON DELETE CASCADE
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