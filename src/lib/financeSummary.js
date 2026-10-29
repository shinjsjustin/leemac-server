const OVER_DUE_DAYS = 30;
const MONTHS_PER_QUARTER = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const cents = (n) => Math.round(n * 100) / 100;
const dateText = (d) => (d instanceof Date ? d.toISOString() : String(d || '')).slice(0, 10);

function monthKeys(year, quarter) {
    const first = (quarter - 1) * MONTHS_PER_QUARTER + 1;
    return Array.from({ length: MONTHS_PER_QUARTER }, (_, i) =>
        `${year}-${String(first + i).padStart(2, '0')}`);
}

// Same dual-path expense linking as GET /overview; UNION counts each expense once.
const EXPENSE_SQL = `SELECT e.id, e.amount, e.expense_date
     FROM expense e
     JOIN expense_job ej ON e.id = ej.expense_id
     JOIN job_period jp ON ej.job_id = jp.job_id
     WHERE jp.financial_period_id = ?
     UNION
     SELECT e.id, e.amount, e.expense_date
     FROM expense e
     JOIN expense_financial_period efp ON e.id = efp.expense_id
     WHERE efp.financial_period_id = ?`;

async function getQuarterSummary(db, periodId, now = new Date()) {
    const [periods] = await db.execute(
        `SELECT year, quarter FROM financial_period WHERE id = ?`, [periodId]);
    if (periods.length === 0) return null;

    const [jobs] = await db.execute(
        `SELECT job.invoice_status, job.total_cost, job.invoice_date
         FROM job_period jp JOIN job ON jp.job_id = job.id
         WHERE jp.financial_period_id = ? AND job.invoice_status IN ('waiting', 'paid')`,
        [periodId]);
    const [expenses] = await db.execute(EXPENSE_SQL, [periodId, periodId]);

    const months = monthKeys(periods[0].year, periods[0].quarter)
        .map((month) => ({ month, invoiced: 0, expenses: 0 }));
    const addToMonth = (date, field, amount) => {
        const m = months.find((x) => x.month === dateText(date).slice(0, 7));
        if (m) m[field] += amount;
    };

    const paid = { count: 0, total: 0 };
    const waiting = { count: 0, total: 0, over_30: 0 };
    const cutoff = dateText(new Date(now.getTime() - OVER_DUE_DAYS * MS_PER_DAY));
    for (const job of jobs) {
        const amount = Number(job.total_cost || 0);
        const bucket = job.invoice_status === 'paid' ? paid : waiting;
        bucket.count += 1;
        bucket.total += amount;
        if (bucket === waiting && job.invoice_date && dateText(job.invoice_date) < cutoff) {
            waiting.over_30 += 1;
        }
        addToMonth(job.invoice_date, 'invoiced', amount);
    }

    const spent = { count: expenses.length, total: 0 };
    for (const exp of expenses) {
        const amount = Number(exp.amount || 0);
        spent.total += amount;
        addToMonth(exp.expense_date, 'expenses', amount);
    }

    return {
        invoiced: { count: paid.count + waiting.count, total: cents(paid.total + waiting.total) },
        paid: { count: paid.count, total: cents(paid.total) },
        waiting: { ...waiting, total: cents(waiting.total) },
        expenses: { count: spent.count, total: cents(spent.total) },
        profit: cents(paid.total - spent.total),
        months: months.map((m) => ({ ...m, invoiced: cents(m.invoiced), expenses: cents(m.expenses) })),
    };
}

module.exports = { getQuarterSummary };
