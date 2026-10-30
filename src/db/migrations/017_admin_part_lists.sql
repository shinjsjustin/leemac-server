-- src/db/migrations/017_admin_part_lists.sql
-- Adds admin_part_list and admin_part_list_item: part lists shared by all
-- admins, kept apart from the client part_list tables. Nothing existing is
-- changed or dropped.
--
-- Run manually against the production database after 016_star_flags.sql
-- and BEFORE deploying the code that reads these tables.
-- Please back up the database first, and do a dry run on a database copy.

CREATE TABLE admin_part_list (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  created_by_id VARCHAR(255) NOT NULL,
  created_by_name VARCHAR(255) NOT NULL,
  updated_by_id VARCHAR(255) NOT NULL,
  updated_by_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE admin_part_list_item (
  id INT NOT NULL AUTO_INCREMENT,
  list_id INT NOT NULL,
  part_id INT NOT NULL,
  added_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_part_list_item (list_id, part_id),
  FOREIGN KEY (list_id) REFERENCES admin_part_list (id) ON DELETE CASCADE,
  FOREIGN KEY (part_id) REFERENCES part (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
