-- src/db/migrations/030_company_bill_to.sql
-- Adds the bill-to columns to company, then sets them for WD Media, Inc.
--
-- Run manually against the production database after 029_notes_process_steps.sql
-- and right before deploying the code that uses bill-to.
-- Please back up the database first, and do a dry run on a database copy.

ALTER TABLE company ADD COLUMN bill_to_name varchar(255) DEFAULT NULL;
ALTER TABLE company ADD COLUMN bill_to_line1 varchar(255) DEFAULT NULL;
ALTER TABLE company ADD COLUMN bill_to_line2 varchar(255) DEFAULT NULL;
ALTER TABLE company ADD COLUMN bill_to_line3 varchar(255) DEFAULT NULL;
ALTER TABLE company ADD COLUMN bill_to_line4 varchar(255) DEFAULT NULL;
ALTER TABLE company ADD COLUMN bill_to_line5 varchar(255) DEFAULT NULL;

-- Only when exactly one company has this name. MySQL rejects a subquery on the
-- table being updated, so the count sits in a derived table.
UPDATE company
SET bill_to_name = 'Western Digital Technologies, Inc.',
    bill_to_line1 = 'c/o Accounts Payable - Shared Service Center',
    bill_to_line2 = '109 Technology Avenue, Laguna Technopark',
    bill_to_line3 = 'Binan, Laguna 4024',
    bill_to_line4 = 'Philippines',
    bill_to_line5 = 'AP.US@wdc.com'
WHERE name = 'WD Media, Inc'
  AND (SELECT matches FROM (SELECT COUNT(*) AS matches FROM company WHERE name = 'WD Media, Inc') AS wd) = 1;
