// One data builder per finance report; PDF and .xlsx both render from these rows.
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BUCKETS = [
    { label: '0-30', maxDays: 30 },
    { label: '31-60', maxDays: 60 },
    { label: '61-90', maxDays: 90 },
    { label: '90+', maxDays: Infinity },
];
const UNCATEGORIZED = 'Uncategorized';
const INVOICED_SQL = `j.invoice_number IS NOT NULL AND TRIM(j.invoice_number) <> ''`;

class ReportError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'ReportError';
        this.status = status;
    }
}

const cents = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (v) => cents(Number(v || 0));
const dateText = (d) => (d instanceof Date ? d.toISOString() : String(d || '')).slice(0, 10);

function isRealDate(text) {
    const m = DATE_RE.exec(text || '');
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toISOString().slice(0, 10) === text;
}

async function parseReportFilter(db, query) {
    const { periodId, from, to } = query || {};
    const hasPeriod = periodId !== undefined && periodId !== '';
    const hasRange = from !== undefined || to !== undefined;
    if (hasPeriod === hasRange) throw new ReportError(400, 'Give either periodId or from and to');
    if (hasPeriod) {
        if (!/^\d+$/.test(String(periodId))) throw new ReportError(400, 'periodId must be a number');
        const [rows] = await db.execute(`SELECT lable FROM financial_period WHERE id = ?`, [Number(periodId)]);
        if (rows.length === 0) throw new ReportError(404, 'Period not found');
        return { periodId: Number(periodId), rangeLabel: rows[0].lable };
    }
    if (!isRealDate(from) || !isRealDate(to)) throw new ReportError(400, 'from and to must be YYYY-MM-DD');
    if (from > to) throw new ReportError(400, 'from must not be after to');
    return { from, to, rangeLabel: `${from} to ${to}` };
}

// Jobs are in a period via job_period, otherwise by invoice_date range.
function jobFilterSql(filter) {
    if (!filter) return { sql: '', params: [] };
    if (filter.periodId !== undefined) {
        return {
            sql: ` AND j.id IN (SELECT job_id FROM job_period WHERE financial_period_id = ?)`,
            params: [filter.periodId],
        };
    }
    return { sql: ` AND j.invoice_date >= ? AND j.invoice_date <= ?`, params: [filter.from, filter.to] };
}

const dayNumber = (text) => {
    const [y, m, d] = text.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / MS_PER_DAY;
};
const bucketFor = (days) => BUCKETS.find((b) => days <= b.maxDays).label;
const emptyBuckets = () => Object.fromEntries(BUCKETS.map((b) => [b.label, 0]));

async function partsByJob(db, jobIds) {
    if (jobIds.length === 0) return new Map();
    const [rows] = await db.execute(
        `SELECT jp.job_id, p.number, p.description, jp.quantity, jp.price
         FROM job_part jp JOIN part p ON p.id = jp.part_id
         WHERE jp.job_id IN (${jobIds.map(() => '?').join(',')})
         ORDER BY jp.id`, jobIds);
    const map = new Map();
    for (const r of rows) {
        const list = map.get(r.job_id) || [];
        list.push({ number: r.number || '', description: r.description || '',
            quantity: Number(r.quantity || 0), price: money(r.price) });
        map.set(r.job_id, list);
    }
    return map;
}

async function buildReceivables(db, { filter, asOf }) {
    const f = jobFilterSql(filter);
    const [jobs] = await db.execute(
        `SELECT j.id, j.job_number, j.invoice_number, j.invoice_date, j.total_cost, c.name AS company_name
         FROM job j JOIN company c ON c.id = j.company_id
         WHERE j.invoice_status = 'waiting' AND ${INVOICED_SQL}${f.sql}
         ORDER BY c.name, j.id`, f.params);
    const parts = await partsByJob(db, jobs.map((j) => j.id));
    const today = dayNumber(asOf);

    const clients = [];
    const totals = { buckets: emptyBuckets(), total: 0 };
    for (const j of jobs) {
        let client = clients[clients.length - 1];
        if (!client || client.name !== j.company_name) {
            client = { name: j.company_name, jobs: [], buckets: emptyBuckets(), total: 0 };
            clients.push(client);
        }
        const invoiceDate = dateText(j.invoice_date);
        const days = invoiceDate ? today - dayNumber(invoiceDate) : null;
        const bucket = days === null ? '90+' : bucketFor(days);
        const total = money(j.total_cost);
        client.jobs.push({ jobNumber: j.job_number, invoiceNumber: j.invoice_number, invoiceDate,
            days, bucket, total, parts: parts.get(j.id) || [] });
        client.buckets[bucket] += total;
        client.total += total;
        totals.buckets[bucket] += total;
        totals.total += total;
    }
    for (const holder of [...clients, totals]) {
        holder.total = cents(holder.total);
        for (const k of Object.keys(holder.buckets)) holder.buckets[k] = cents(holder.buckets[k]);
    }
    return { title: 'Accounts Receivable', rangeLabel: filter ? filter.rangeLabel : 'All waiting invoices',
        asOf, clients, totals };
}

async function buildLedger(db, { filter }) {
    const f = jobFilterSql(filter);
    const [jobs] = await db.execute(
        `SELECT j.id, j.job_number, j.invoice_number, j.invoice_date, j.subtotal, j.tax, j.total_cost,
                j.invoice_status, j.paid_date, c.name AS company_name
         FROM job j JOIN company c ON c.id = j.company_id
         WHERE ${INVOICED_SQL}${f.sql}
         ORDER BY j.invoice_date, j.invoice_number, j.id`, f.params);
    const totals = { subtotal: 0, tax: 0, total: 0 };
    const rows = jobs.map((j) => {
        const row = { jobNumber: j.job_number, client: j.company_name, invoiceNumber: j.invoice_number,
            invoiceDate: dateText(j.invoice_date), subtotal: money(j.subtotal), tax: money(j.tax),
            total: money(j.total_cost), status: j.invoice_status, paidDate: dateText(j.paid_date) };
        totals.subtotal += row.subtotal;
        totals.tax += row.tax;
        totals.total += row.total;
        return row;
    });
    return { title: 'Invoice Ledger', rangeLabel: filter.rangeLabel, rows,
        totals: { subtotal: cents(totals.subtotal), tax: cents(totals.tax), total: cents(totals.total) } };
}

// Same dual-path linking as the Expenses tab; UNION counts each expense once.
function expenseFilterSql(filter) {
    if (filter.periodId !== undefined) {
        return {
            sql: `e.id IN (SELECT expense_id FROM expense_financial_period WHERE financial_period_id = ?)
                  OR e.id IN (SELECT ej.expense_id FROM expense_job ej
                              JOIN job_period jp ON jp.job_id = ej.job_id
                              WHERE jp.financial_period_id = ?)`,
            params: [filter.periodId, filter.periodId],
        };
    }
    return { sql: `e.expense_date >= ? AND e.expense_date <= ?`, params: [filter.from, filter.to] };
}

async function buildExpenses(db, { filter }) {
    const f = expenseFilterSql(filter);
    const [expenses] = await db.execute(
        `SELECT e.id, e.expense_date, e.vendor, e.description, e.category, e.amount, e.file_id
         FROM expense e WHERE ${f.sql}
         ORDER BY e.expense_date, e.id`, f.params);
    const jobsByExpense = new Map();
    if (expenses.length > 0) {
        const [links] = await db.execute(
            `SELECT ej.expense_id, j.job_number FROM expense_job ej JOIN job j ON j.id = ej.job_id
             WHERE ej.expense_id IN (${expenses.map(() => '?').join(',')})
             ORDER BY j.job_number`, expenses.map((e) => e.id));
        for (const l of links) {
            jobsByExpense.set(l.expense_id, [...(jobsByExpense.get(l.expense_id) || []), l.job_number]);
        }
    }
    const byCategory = new Map();
    let total = 0;
    const rows = expenses.map((e) => {
        const amount = money(e.amount);
        const category = e.category || UNCATEGORIZED;
        byCategory.set(category, (byCategory.get(category) || 0) + amount);
        total += amount;
        return { id: e.id, date: dateText(e.expense_date), vendor: e.vendor || '',
            description: e.description || '', category, amount,
            jobs: (jobsByExpense.get(e.id) || []).join(', '), receipt: e.file_id ? 'yes' : 'no' };
    });
    const categories = [...byCategory].map(([category, sum]) => ({ category, total: cents(sum) }))
        .sort((a, b) => a.category.localeCompare(b.category));
    return { title: 'Expenses', rangeLabel: filter.rangeLabel, rows, categories, total: cents(total) };
}

module.exports = { ReportError, parseReportFilter, buildReceivables, buildLedger, buildExpenses };
