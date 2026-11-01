const { test } = require('node:test');
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const {
    ExpenseError, normalizeVendor, listVendors, createSupplierExpense,
} = require('../../src/lib/supplierExpenses');

const SCHEMA = `
CREATE TABLE job (id INTEGER PRIMARY KEY);
CREATE TABLE financial_period (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT);
CREATE TABLE uploaded_files (id INTEGER PRIMARY KEY, filename TEXT, mimetype TEXT, size INTEGER, content BLOB, job_id INTEGER, part_id INTEGER, note_id INTEGER);
CREATE TABLE expense (id INTEGER PRIMARY KEY, description TEXT, vendor TEXT, amount REAL, expense_date TEXT, category TEXT, notes TEXT, file_id INTEGER);
CREATE TABLE expense_job (id INTEGER PRIMARY KEY, expense_id INTEGER, job_id INTEGER);
CREATE TABLE expense_financial_period (id INTEGER PRIMARY KEY, expense_id INTEGER, financial_period_id INTEGER);
INSERT INTO job (id) VALUES (5);
INSERT INTO financial_period (id, start_date, end_date) VALUES (7, '2026-07-01', '2026-09-30');
INSERT INTO expense (id, description, vendor, amount, expense_date) VALUES
    (1, 'a', 'McMaster-Carr', 10, '2026-01-02'),
    (2, 'b', 'McMaster-Carr', 20, '2026-03-04'),
    (3, 'c', 'mcmaster-carr', 30, '2026-02-01'),
    (4, 'd', 'Acme  Steel', 40, '2026-05-05'),
    (5, 'e', NULL, 50, '2026-05-06');
`;

function makeDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    const run = async (sql, params = []) => {
        if (/^\s*select/i.test(sql)) {
            return [sqlite.prepare(sql).all(...params).map((r) => ({ ...r }))];
        }
        const r = sqlite.prepare(sql).run(...params);
        return [{ insertId: Number(r.lastInsertRowid), affectedRows: r.changes }];
    };
    const log = [];
    const conn = {
        execute: run,
        query: run,
        beginTransaction: async () => { log.push('begin'); sqlite.exec('BEGIN'); },
        commit: async () => { log.push('commit'); sqlite.exec('COMMIT'); },
        rollback: async () => { log.push('rollback'); sqlite.exec('ROLLBACK'); },
        release: () => {},
    };
    return { execute: run, getConnection: async () => conn, sqlite, log };
}

const body = (over = {}) => ({
    vendor: 'McMaster-Carr', amount: '12.50', expense_date: '2026-10-10', description: 'Bolts', ...over,
});
const pdf = { originalname: 'r.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('abc') };
const count = (db, t) => db.sqlite.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;

async function rejects(promise, status, check = () => {}) {
    await assert.rejects(promise, (e) => {
        assert.ok(e instanceof ExpenseError);
        assert.strictEqual(e.status, status);
        check(e);
        return true;
    });
}

test('normalizeVendor trims, collapses spaces and lowercases', () => {
    assert.strictEqual(normalizeVendor('  Acme   STEEL '), 'acme steel');
});

test('vendor matched ignoring case and spacing saves the existing spelling', async () => {
    const db = makeDb();
    const r = await createSupplierExpense(db, body({ vendor: '  mcmaster-CARR ' }), null);
    assert.strictEqual(r.vendor, 'McMaster-Carr');
    assert.strictEqual(r.vendor_created, false);
    const row = db.sqlite.prepare('SELECT * FROM expense WHERE id = ?').get(r.id);
    assert.strictEqual(row.vendor, 'McMaster-Carr');
    assert.strictEqual(row.amount, 12.5);
    assert.strictEqual(row.description, 'Bolts');
});

test('unknown vendor without new_vendor throws 400 with closest suggestions', async () => {
    const db = makeDb();
    await rejects(createSupplierExpense(db, body({ vendor: 'Acme Steal' }), null), 400, (e) => {
        assert.strictEqual(e.body.suggestions[0], 'Acme  Steel');
        assert.ok(e.body.suggestions.length <= 5);
    });
    assert.strictEqual(count(db, 'expense'), 5);
});

test('suggestions are capped at 5 names', async () => {
    const db = makeDb();
    for (const v of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
        db.sqlite.prepare('INSERT INTO expense (description, vendor, amount, expense_date) VALUES (?,?,?,?)')
            .run('x', v, 1, '2026-01-01');
    }
    await rejects(createSupplierExpense(db, body({ vendor: 'v' }), null), 400, (e) => {
        assert.strictEqual(e.body.suggestions.length, 5);
    });
});

for (const flag of [true, 'true']) {
    test(`new_vendor ${JSON.stringify(flag)} saves an unknown vendor`, async () => {
        const db = makeDb();
        const r = await createSupplierExpense(db, body({ vendor: ' Fresh   Co ', new_vendor: flag }), null);
        assert.strictEqual(r.vendor, 'Fresh Co');
        assert.strictEqual(r.vendor_created, true);
    });
}

test('same normalised vendor, amount and date throws 409 with existing_id and writes nothing', async () => {
    const db = makeDb();
    await rejects(
        createSupplierExpense(db, body({ vendor: 'ACME steel', amount: 40, expense_date: '2026-05-05' }), pdf),
        409,
        (e) => assert.strictEqual(e.body.existing_id, 4),
    );
    assert.strictEqual(count(db, 'expense'), 5);
    assert.strictEqual(count(db, 'uploaded_files'), 0);
});

test('same vendor and amount on another date is not a duplicate', async () => {
    const db = makeDb();
    const r = await createSupplierExpense(db, body({ vendor: 'Acme Steel', amount: 40 }), null);
    assert.ok(r.id);
});

test('job_id adds an expense_job row and a date inside a period adds a period link', async () => {
    const db = makeDb();
    const r = await createSupplierExpense(db, body({ job_id: 5, expense_date: '2026-08-15' }), null);
    assert.strictEqual(r.job_id, 5);
    assert.strictEqual(r.period_id, 7);
    const job = db.sqlite.prepare('SELECT * FROM expense_job').all();
    assert.deepStrictEqual(job.map((j) => [j.expense_id, j.job_id]), [[r.id, 5]]);
    const per = db.sqlite.prepare('SELECT * FROM expense_financial_period').all();
    assert.deepStrictEqual(per.map((p) => [p.expense_id, p.financial_period_id]), [[r.id, 7]]);
});

test('no job_id and a date outside every period add no links', async () => {
    const db = makeDb();
    const r = await createSupplierExpense(db, body({ expense_date: '2026-12-15' }), null);
    assert.strictEqual(r.job_id, null);
    assert.strictEqual(r.period_id, null);
    assert.strictEqual(count(db, 'expense_job'), 0);
    assert.strictEqual(count(db, 'expense_financial_period'), 0);
});

test('an unknown job throws 404 and writes nothing', async () => {
    const db = makeDb();
    await rejects(createSupplierExpense(db, body({ job_id: 99 }), pdf), 404);
    assert.strictEqual(count(db, 'expense'), 5);
    assert.strictEqual(count(db, 'uploaded_files'), 0);
});

test('a PDF file inserts an unlinked uploaded_files row and sets expense.file_id', async () => {
    const db = makeDb();
    const r = await createSupplierExpense(db, body(), pdf);
    const file = db.sqlite.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(r.file_id);
    assert.strictEqual(file.filename, 'r.pdf');
    assert.strictEqual(file.mimetype, 'application/pdf');
    assert.strictEqual(file.size, 3);
    assert.strictEqual(file.job_id, null);
    assert.strictEqual(file.part_id, null);
    assert.strictEqual(file.note_id, null);
    assert.strictEqual(db.sqlite.prepare('SELECT file_id FROM expense WHERE id = ?').get(r.id).file_id, r.file_id);
    assert.deepStrictEqual(db.log, ['begin', 'commit']);
});

test('no file leaves file_id null', async () => {
    const db = makeDb();
    const r = await createSupplierExpense(db, body(), null);
    assert.strictEqual(r.file_id, null);
});

test('a non-PDF file throws 400 and writes nothing', async () => {
    const db = makeDb();
    await rejects(createSupplierExpense(db, body(), { ...pdf, originalname: 'r.png', mimetype: 'image/png' }), 400);
    assert.strictEqual(count(db, 'uploaded_files'), 0);
    assert.strictEqual(count(db, 'expense'), 5);
});

const BAD = [
    ['missing vendor', { vendor: '' }],
    ['vendor over 100', { vendor: 'x'.repeat(101) }],
    ['missing amount', { amount: undefined }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: '-3' }],
    ['three decimals', { amount: '1.234' }],
    ['non-numeric amount', { amount: 'abc' }],
    ['missing date', { expense_date: undefined }],
    ['bad date format', { expense_date: '10/10/2026' }],
    ['impossible date', { expense_date: '2026-02-31' }],
    ['missing description', { description: ' ' }],
    ['description over 255', { description: 'x'.repeat(256) }],
    ['category over 50', { category: 'x'.repeat(51) }],
];
for (const [name, over] of BAD) {
    test(`${name} throws 400`, async () => {
        const db = makeDb();
        await rejects(createSupplierExpense(db, body(over), null), 400);
        assert.strictEqual(count(db, 'expense'), 5);
    });
}

test('a failed insert rolls back the transaction', async () => {
    const db = makeDb();
    db.sqlite.exec('DROP TABLE expense_financial_period');
    await assert.rejects(createSupplierExpense(db, body({ expense_date: '2026-08-15' }), pdf));
    assert.deepStrictEqual(db.log, ['begin', 'rollback']);
    assert.strictEqual(count(db, 'uploaded_files'), 0);
    assert.strictEqual(count(db, 'expense'), 5);
});

test('listVendors merges spellings per normalised name, most-used spelling, sorted by name', async () => {
    const db = makeDb();
    assert.deepStrictEqual(await listVendors(db), [
        { name: 'Acme  Steel', expenses: 1, last_used: '2026-05-05' },
        { name: 'McMaster-Carr', expenses: 3, last_used: '2026-03-04' },
    ]);
});
