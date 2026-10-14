const { BadQuery, parseInteger, groupBy } = require('../../lib/bourne/helpers');

// Every query here is a SELECT with explicit columns.
const EMPTY_TOTAL = { count: 0, total_amount: 0 };
const PERIOD_COLUMNS = 'id, lable AS label, quarter, year, start_date, end_date';

const toTotal = (count, amount) => ({ count, total_amount: parseFloat(amount || 0) });

function buildSummary(waiting = EMPTY_TOTAL, paid = EMPTY_TOTAL, expenses = EMPTY_TOTAL) {
    return {
        waiting,
        paid,
        combined: { count: waiting.count + paid.count, total_amount: waiting.total_amount + paid.total_amount },
        expenses,
    };
}

async function fetchCurrentPeriodId(db) {
    const [rows] = await db.execute(
        `SELECT metavalue FROM metadata WHERE metakey = 'current_financial_period_id'`);
    return rows.length === 0 ? null : JSON.parse(rows[0].metavalue);
}

async function fetchInvoiceTotals(db) {
    const [rows] = await db.execute(
        `SELECT invoice_status, COUNT(*) AS count, COALESCE(SUM(total_cost), 0) AS total_amount
         FROM job WHERE invoice_number IS NOT NULL AND invoice_status IN ('waiting', 'paid')
         GROUP BY invoice_status`);
    const byStatus = new Map(rows.map((r) => [r.invoice_status, toTotal(r.count, r.total_amount)]));
    return { waiting: byStatus.get('waiting') || EMPTY_TOTAL, paid: byStatus.get('paid') || EMPTY_TOTAL };
}

async function fetchPeriodSummaries(db) {
    const [invoiceRows] = await db.execute(
        `SELECT jp.financial_period_id AS period_id, job.invoice_status,
            COUNT(*) AS count, COALESCE(SUM(job.total_cost), 0) AS total_amount
         FROM job_period jp JOIN job ON jp.job_id = job.id
         WHERE job.invoice_status IN ('waiting', 'paid')
         GROUP BY jp.financial_period_id, job.invoice_status`);
    // UNION (not UNION ALL) counts an expense once when it reaches a period through both links.
    const [expenseRows] = await db.execute(
        `SELECT period_id, COUNT(DISTINCT e_id) AS count, COALESCE(SUM(amount), 0) AS total_expenses
         FROM (
             SELECT jp.financial_period_id AS period_id, e.id AS e_id, e.amount
             FROM expense e
             JOIN expense_job ej ON e.id = ej.expense_id
             JOIN job_period jp ON ej.job_id = jp.job_id
             UNION
             SELECT efp.financial_period_id AS period_id, e.id AS e_id, e.amount
             FROM expense e
             JOIN expense_financial_period efp ON e.id = efp.expense_id
         ) AS period_expenses
         GROUP BY period_id`);
    const invoices = groupBy(invoiceRows, 'period_id');
    const expenses = new Map(expenseRows.map((r) => [r.period_id, toTotal(r.count, r.total_expenses)]));
    return (periodId) => {
        const rows = invoices.get(periodId) || [];
        const find = (status) => {
            const row = rows.find((r) => r.invoice_status === status);
            return row ? toTotal(row.count, row.total_amount) : EMPTY_TOTAL;
        };
        return buildSummary(find('waiting'), find('paid'), expenses.get(periodId));
    };
}

function financesHandler(db) {
    return async (req, res) => {
        try {
            const [currentPeriodId, invoices, [periods], summaryFor] = await Promise.all([
                fetchCurrentPeriodId(db),
                fetchInvoiceTotals(db),
                db.execute(`SELECT ${PERIOD_COLUMNS} FROM financial_period ORDER BY year DESC, quarter DESC`),
                fetchPeriodSummaries(db),
            ]);
            res.json({
                current_period_id: currentPeriodId,
                invoices,
                periods: periods.map((p) => ({ ...p, summary: summaryFor(p.id) })),
            });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch finances.' });
        }
    };
}

const sumAmounts = (rows, field) => rows.reduce((sum, r) => sum + parseFloat(r[field] || 0), 0);

function summarizeJobs(jobs, status) {
    const matching = jobs.filter((j) => j.invoice_status === status);
    return { count: matching.length, total_amount: sumAmounts(matching, 'total_cost') };
}

function periodDetailHandler(db) {
    return async (req, res) => {
        try {
            const id = parseInteger(req.params.id, 'id');
            const [periodRows] = await db.execute(
                `SELECT ${PERIOD_COLUMNS} FROM financial_period WHERE id = ?`, [id]);
            if (periodRows.length === 0) return res.status(404).json({ error: 'Financial period not found.' });

            const [[jobs], [expenses]] = await Promise.all([
                db.execute(
                    `SELECT j.id, j.job_number, c.name AS client, j.po_number, j.invoice_number,
                        j.invoice_date, j.invoice_status, j.total_cost
                     FROM job_period jp
                     JOIN job j ON jp.job_id = j.id
                     JOIN company c ON j.company_id = c.id
                     WHERE jp.financial_period_id = ? ORDER BY j.invoice_date DESC, j.id`, [id]),
                db.execute(
                    `SELECT e.id, e.description, e.vendor, e.amount, e.expense_date, e.category
                     FROM expense e
                     WHERE e.id IN (
                         SELECT ej.expense_id FROM expense_job ej
                         JOIN job_period jp ON ej.job_id = jp.job_id
                         WHERE jp.financial_period_id = ?
                         UNION
                         SELECT efp.expense_id FROM expense_financial_period efp
                         WHERE efp.financial_period_id = ?
                     )
                     ORDER BY e.expense_date DESC, e.id`, [id, id]),
            ]);

            res.json({
                period: periodRows[0],
                summary: buildSummary(
                    summarizeJobs(jobs, 'waiting'),
                    summarizeJobs(jobs, 'paid'),
                    { count: expenses.length, total_amount: sumAmounts(expenses, 'amount') },
                ),
                jobs,
                expenses,
            });
        } catch (e) {
            if (e instanceof BadQuery) return res.status(400).json({ error: e.message });
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch financial period.' });
        }
    };
}

module.exports = { financesHandler, periodDetailHandler };
