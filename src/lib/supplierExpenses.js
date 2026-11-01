const MAX_VENDOR = 100;
const MAX_DESCRIPTION = 255;
const MAX_CATEGORY = 50;
const MAX_SUGGESTIONS = 5;
const PDF_MIMETYPE = 'application/pdf';
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class ExpenseError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.body = { error: message, ...extra };
    }
}

function normalizeVendor(name) {
    return String(name).trim().replace(/\s+/g, ' ').toLowerCase();
}

function editDistance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = row;
    }
    return prev[b.length];
}

async function listVendors(db) {
    const [rows] = await db.execute(
        `SELECT vendor, COUNT(*) AS expenses, MAX(expense_date) AS last_used
         FROM expense WHERE vendor IS NOT NULL AND TRIM(vendor) <> '' GROUP BY vendor`
    );
    const groups = new Map();
    for (const row of rows) {
        const key = normalizeVendor(row.vendor);
        const group = groups.get(key) || { name: row.vendor, top: 0, expenses: 0, last_used: null };
        const count = Number(row.expenses);
        if (count > group.top || (count === group.top && row.vendor < group.name)) {
            group.name = row.vendor;
            group.top = count;
        }
        group.expenses += count;
        if (group.last_used === null || row.last_used > group.last_used) group.last_used = row.last_used;
        groups.set(key, group);
    }
    return [...groups.values()]
        .map(({ name, expenses, last_used }) => ({ name, expenses, last_used }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function isRealDate(value) {
    if (!DATE_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validate(body) {
    const vendor = String(body.vendor ?? '').trim().replace(/\s+/g, ' ');
    const description = String(body.description ?? '').trim();
    const amountText = String(body.amount ?? '').trim();
    const date = String(body.expense_date ?? '').trim();
    if (!vendor || vendor.length > MAX_VENDOR) throw new ExpenseError(400, `vendor is required (max ${MAX_VENDOR} characters)`);
    if (!AMOUNT_PATTERN.test(amountText) || Number(amountText) <= 0) {
        throw new ExpenseError(400, 'amount must be positive with at most 2 decimals');
    }
    if (!isRealDate(date)) throw new ExpenseError(400, 'expense_date must be YYYY-MM-DD');
    if (!description || description.length > MAX_DESCRIPTION) {
        throw new ExpenseError(400, `description is required (max ${MAX_DESCRIPTION} characters)`);
    }
    const category = body.category ? String(body.category).trim() : null;
    if (category && category.length > MAX_CATEGORY) throw new ExpenseError(400, `category is at most ${MAX_CATEGORY} characters`);
    const jobId = body.job_id === undefined || body.job_id === null || body.job_id === '' ? null : Number(body.job_id);
    if (jobId !== null && !Number.isInteger(jobId)) throw new ExpenseError(400, 'job_id must be a number');
    return {
        vendor, description, date, category, jobId,
        amount: Number(amountText),
        notes: body.notes ? String(body.notes) : null,
        isNewVendor: body.new_vendor === true || body.new_vendor === 'true',
    };
}

async function createSupplierExpense(db, body, file) {
    const input = validate(body);
    if (file && file.mimetype !== PDF_MIMETYPE) throw new ExpenseError(400, 'file must be a PDF');

    if (input.jobId !== null) {
        const [jobs] = await db.execute(`SELECT id FROM job WHERE id = ?`, [input.jobId]);
        if (jobs.length === 0) throw new ExpenseError(404, 'Job not found');
    }

    const vendors = await listVendors(db);
    const key = normalizeVendor(input.vendor);
    const match = vendors.find((v) => normalizeVendor(v.name) === key);
    if (!match && !input.isNewVendor) {
        const suggestions = vendors
            .map((v) => ({ name: v.name, distance: editDistance(key, normalizeVendor(v.name)) }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, MAX_SUGGESTIONS)
            .map((v) => v.name);
        throw new ExpenseError(400, 'Unknown vendor', { suggestions });
    }
    const vendor = match ? match.name : input.vendor;

    const [sameDay] = await db.execute(
        `SELECT id, vendor FROM expense WHERE amount = ? AND expense_date = ?`,
        [input.amount, input.date]
    );
    const duplicate = sameDay.find((e) => e.vendor && normalizeVendor(e.vendor) === key);
    if (duplicate) throw new ExpenseError(409, 'Duplicate expense', { existing_id: duplicate.id });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        let fileId = null;
        if (file) {
            const [uploaded] = await conn.execute(
                `INSERT INTO uploaded_files (filename, mimetype, size, content) VALUES (?, ?, ?, ?)`,
                [file.originalname, file.mimetype, file.size, file.buffer]
            );
            fileId = uploaded.insertId;
        }
        const [created] = await conn.execute(
            `INSERT INTO expense (description, vendor, amount, expense_date, category, notes, file_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [input.description, vendor, input.amount, input.date, input.category, input.notes, fileId]
        );
        const id = created.insertId;
        if (input.jobId !== null) {
            await conn.execute(`INSERT INTO expense_job (expense_id, job_id) VALUES (?, ?)`, [id, input.jobId]);
        }
        const [periods] = await conn.execute(
            `SELECT id FROM financial_period WHERE start_date <= ? AND end_date >= ? LIMIT 1`,
            [input.date, input.date]
        );
        const periodId = periods.length > 0 ? periods[0].id : null;
        if (periodId !== null) {
            await conn.execute(
                `INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES (?, ?)`,
                [id, periodId]
            );
        }
        await conn.commit();
        return { id, vendor, vendor_created: !match, job_id: input.jobId, period_id: periodId, file_id: fileId };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

module.exports = { ExpenseError, normalizeVendor, listVendors, createSupplierExpense };
