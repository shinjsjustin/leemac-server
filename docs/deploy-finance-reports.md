# Deploy: finance reports, paid dates and Q4 2026

Migrations `025_invoice_paid_date.sql`, `026_q4_2026_period.sql` and `027_flip_waiting_invoices.sql` run in that order. Apply all three before deploying the server, because the code reads `job.paid_date`.

1. Back up the database: `mysqldump <database> > backup.sql`.
2. Dry run all three, in order, on a copy restored from that backup. It needs `024_qc_markings.sql` applied first. Run each check below on the copy after its migration.
3. Run the same three on the live database, in order, with the check after each.
4. Deploy the server.

## 025_invoice_paid_date.sql

Adds `job.paid_date` and the `invoice_paid_flip` table. Additive only.

Check: returns 1 for the column and 1 for the table.

```sql
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'paid_date';

SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'invoice_paid_flip';
```

## 026_q4_2026_period.sql

Ends Q3 2026 on 2026-09-30, adds Q4 2026 (Oct 1 to Dec 31), moves jobs invoiced Oct-Dec from Q3 to Q4, links expenses dated Oct-Dec to Q4 only, and makes Q4 the current period. Not safe to rerun: the Q4 insert fails the second time.

Checks:

```sql
-- Q3 ends 2026-09-30 and Q4 exists (2 rows: Q3 end 2026-09-30, Q4 2026-10-01 to 2026-12-31)
SELECT lable, start_date, end_date FROM financial_period
WHERE year = 2026 AND quarter IN (3, 4);

-- Q4 holds the Oct-Dec jobs; no job invoiced Oct-Dec is left in Q3 (returns 0)
SELECT COUNT(*) FROM job_period jp JOIN job j ON j.id = jp.job_id
WHERE jp.financial_period_id = (SELECT id FROM financial_period WHERE quarter = 3 AND year = 2026)
  AND j.invoice_date >= '2026-10-01';

-- Expenses 36-43 are linked to Q4 (should list them)
SELECT efp.expense_id FROM expense_financial_period efp
WHERE efp.financial_period_id = (SELECT id FROM financial_period WHERE quarter = 4 AND year = 2026)
  AND efp.expense_id BETWEEN 36 AND 43
ORDER BY efp.expense_id;
```

## 027_flip_waiting_invoices.sql

Marks every invoiced job still `waiting` as `paid`, with `paid_date` left NULL (about 215 are really paid). It saves the flipped job ids in `invoice_paid_flip` first. Uninvoiced and already-paid jobs are untouched.

After 027, accounts receivable (AR) starts near empty: almost every waiting invoice is now paid, so the receivables report lists only invoices that come after the flip. Set the real dates later with the paid-date editor on the Finances page.

Checks:

```sql
-- Flipped count (about 215)
SELECT COUNT(*) FROM invoice_paid_flip;

-- No invoiced job is still waiting (returns 0)
SELECT COUNT(*) FROM job
WHERE invoice_status = 'waiting' AND invoice_number IS NOT NULL AND TRIM(invoice_number) <> '';
```

## Undo 027

`src/db/rollback/027_flip_waiting_invoices_undo.sql` puts the flipped jobs back to `waiting`. Run it only if the flip was wrong, and before anyone relies on the new paid state. A flipped job that has since been given a `paid_date` by hand stays paid. Back up first, and dry run on a copy.

Check after the undo: the count of jobs from `invoice_paid_flip` still `paid` with a NULL `paid_date` is 0.

```sql
SELECT COUNT(*) FROM job
WHERE id IN (SELECT job_id FROM invoice_paid_flip)
  AND invoice_status = 'paid' AND paid_date IS NULL;
```

The undo leaves 025 and 026 in place. Rows stay in `invoice_paid_flip`; running 027 again would add them a second time.
