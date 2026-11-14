-- src/db/migrations/026_q4_2026_period.sql
-- Q3 2026 wrongly runs to 2026-12-31. Ends it on 2026-09-30, adds Q4 2026
-- (Oct 1 to Dec 31), moves jobs invoiced Oct-Dec from Q3 to Q4, links every
-- expense dated Oct-Dec to Q4 only (this also picks up unlinked November
-- expenses), and makes Q4 the current period.
--
-- Run manually against the production database after 025_invoice_paid_date.sql
-- and BEFORE deploying. Not safe to rerun: the Q4 insert fails on a second run.
-- Please back up the database first, and do a dry run on a database copy.

UPDATE financial_period
SET end_date = '2026-09-30'
WHERE quarter = 3 AND year = 2026;

INSERT INTO financial_period (lable, quarter, year, start_date, end_date)
VALUES ('Q4 2026', 4, 2026, '2026-10-01', '2026-12-31');

UPDATE job_period
SET financial_period_id = (SELECT id FROM financial_period WHERE quarter = 4 AND year = 2026)
WHERE financial_period_id = (SELECT id FROM financial_period WHERE quarter = 3 AND year = 2026)
  AND job_id IN (
    SELECT id FROM job WHERE invoice_date >= '2026-10-01' AND invoice_date <= '2026-12-31'
  );

DELETE FROM expense_financial_period
WHERE financial_period_id = (SELECT id FROM financial_period WHERE quarter = 3 AND year = 2026)
  AND expense_id IN (
    SELECT id FROM expense WHERE expense_date >= '2026-10-01' AND expense_date <= '2026-12-31'
  );

INSERT INTO expense_financial_period (expense_id, financial_period_id)
SELECT e.id, (SELECT id FROM financial_period WHERE quarter = 4 AND year = 2026)
FROM expense e
WHERE e.expense_date >= '2026-10-01' AND e.expense_date <= '2026-12-31'
  AND NOT EXISTS (
    SELECT 1 FROM expense_financial_period x
    WHERE x.expense_id = e.id
      AND x.financial_period_id = (SELECT id FROM financial_period WHERE quarter = 4 AND year = 2026)
  );

REPLACE INTO metadata (metakey, metavalue)
SELECT 'current_financial_period_id', CAST(id AS CHAR)
FROM financial_period WHERE quarter = 4 AND year = 2026;
