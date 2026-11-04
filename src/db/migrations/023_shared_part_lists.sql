-- src/db/migrations/023_shared_part_lists.sql
-- Shared admin part lists. Adds a share token and switch to admin_part_list,
-- records which company added each item (NULL means an admin added it), and
-- creates admin_part_list_member (one row per list and company). Additive only;
-- existing lists stay private (share_enabled defaults to 0).
--
-- Run manually against the production database after 022_job_no_bid.sql
-- and BEFORE deploying the code that uses these columns.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE admin_part_list
  ADD COLUMN share_token VARCHAR(64) NULL,
  ADD COLUMN share_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_admin_part_list_share_token (share_token);

ALTER TABLE admin_part_list_item
  ADD COLUMN added_by_company_id INT NULL,
  ADD FOREIGN KEY (added_by_company_id) REFERENCES company (id) ON DELETE SET NULL;

CREATE TABLE admin_part_list_member (
  id INT NOT NULL AUTO_INCREMENT,
  list_id INT NOT NULL,
  company_id INT NOT NULL,
  joined_by_id VARCHAR(255) NOT NULL,
  joined_by_name VARCHAR(255) NOT NULL,
  joined_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_part_list_member (list_id, company_id),
  FOREIGN KEY (list_id) REFERENCES admin_part_list (id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
