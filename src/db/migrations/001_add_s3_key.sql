-- Migration: 001_add_s3_key
-- Description: Add s3_key column to uploaded_files and make content nullable
--              in preparation for moving file storage from DB blobs to S3.

-- Add s3_key column if it does not already exist
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'uploaded_files'
    AND COLUMN_NAME  = 's3_key'
);

SET @add_col = IF(
  @col_exists = 0,
  'ALTER TABLE uploaded_files ADD COLUMN s3_key VARCHAR(1024) NULL AFTER content',
  'SELECT ''s3_key column already exists, skipping ADD'' AS migration_note'
);

PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Make content nullable (idempotent: MODIFY is safe to re-run)
ALTER TABLE uploaded_files MODIFY content LONGBLOB NULL;

-- Add index on s3_key if it does not already exist
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'uploaded_files'
    AND INDEX_NAME   = 'idx_uploaded_files_s3_key'
);

SET @add_idx = IF(
  @idx_exists = 0,
  'ALTER TABLE uploaded_files ADD INDEX idx_uploaded_files_s3_key (s3_key(768))',
  'SELECT ''idx_uploaded_files_s3_key already exists, skipping CREATE'' AS migration_note'
);

PREPARE stmt FROM @add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- ROLLBACK (run manually if you need to revert this migration)
-- ============================================================
-- ALTER TABLE uploaded_files MODIFY content LONGBLOB NOT NULL;
-- ALTER TABLE uploaded_files DROP INDEX idx_uploaded_files_s3_key;
-- ALTER TABLE uploaded_files DROP COLUMN s3_key;
-- ============================================================
