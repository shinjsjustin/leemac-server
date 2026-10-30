const test = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const { listParts } = require('../../src/lib/portal');

const base = (part_id, part_number, part_description) => ({ part_id, part_number, part_description });
const PART_ROWS = [
    { ...base(1, 'A-1', 'Bracket'), job_id: 12, job_number: 'J12', job_part_id: 101, rev: 'C', material: '6061', finish: 'Anodize', quantity: 50, star_status: 'open', po_date: '2026-03-05', ship_date: null, invoice_date: null },
    { ...base(1, 'A-1', 'Bracket'), job_id: 12, job_number: 'J12', job_part_id: 102, rev: 'B', material: '7075', finish: null, quantity: 5, star_status: null, po_date: '2026-03-05', ship_date: null, invoice_date: null },
    { ...base(1, 'A-1', 'Bracket'), job_id: 7, job_number: 'J7', job_part_id: 70, rev: 'A', material: '6061', finish: null, quantity: 10, star_status: 'open', po_date: '2026-01-01', ship_date: '2026-01-01', invoice_date: null },
    { ...base(2, 'B-2', 'Plate'), job_id: 7, job_number: 'J7', job_part_id: 71, rev: null, material: 'steel', finish: 'Zinc', quantity: 3, star_status: null, po_date: null, ship_date: null, invoice_date: null },
];

const FILE_ROWS = [
    { id: 90, filename: 'new.pdf', mimetype: 'application/pdf', part_id: 1 },
    { id: 80, filename: 'old.PDF', mimetype: 'application/octet-stream', part_id: 1 },
];

const dbWith = (files = FILE_ROWS) =>
    makeFakeDb([
        { match: /FROM job_part/, rows: PART_ROWS },
        { match: /FROM uploaded_files/, rows: files },
    ]);

test('returns each part once with only whitelisted keys', async () => {
    const result = await listParts(dbWith(), 5);
    assert.strictEqual(result.length, 2);
    for (const part of result) {
        assert.deepStrictEqual(
            Object.keys(part).sort(),
            ['drawing_count', 'jobs', 'latest', 'latest_drawing', 'part_description', 'part_id', 'part_number']
        );
    }
});

test('lists each job once in query order with only id and job_number', async () => {
    const result = await listParts(dbWith(), 5);
    assert.deepStrictEqual(result[0].jobs, [
        { id: 12, job_number: 'J12' },
        { id: 7, job_number: 'J7' },
    ]);
    assert.deepStrictEqual(result[1].jobs, [{ id: 7, job_number: 'J7' }]);
});

test('orders jobs newest first in SQL', async () => {
    const db = dbWith();
    await listParts(db, 5);
    assert.match(db.calls[0].sql, /ORDER BY p\.number, j\.created_at DESC, j\.id DESC/);
});

test('counts drawings and picks the first (newest) as latest_drawing', async () => {
    const result = await listParts(dbWith(), 5);
    assert.strictEqual(result[0].drawing_count, 2);
    assert.deepStrictEqual(result[0].latest_drawing, { id: 90, filename: 'new.pdf', mimetype: 'application/pdf' });
});

test('latest_drawing is null and count 0 when part has no drawings', async () => {
    const result = await listParts(dbWith(), 5);
    assert.strictEqual(result[1].drawing_count, 0);
    assert.strictEqual(result[1].latest_drawing, null);
});

test('drawing query is limited to part-level PDFs, newest first', async () => {
    const db = dbWith();
    await listParts(db, 5);
    const sql = db.calls[1].sql;
    assert.match(sql, /f\.part_id IN \(\?, \?\)/);
    assert.match(sql, /f\.job_id IS NULL AND f\.note_id IS NULL/);
    assert.match(sql, /application\/pdf/);
    assert.match(sql, /ORDER BY f\.uploaded_at DESC, f\.id DESC/);
    assert.deepStrictEqual(db.calls[1].params, [1, 2]);
});

test('skips the drawing query when no parts exist', async () => {
    const db = makeFakeDb([]);
    const result = await listParts(db, 5);
    assert.deepStrictEqual(result, []);
    assert.strictEqual(db.calls.length, 1);
});

test('binds companyId and never selects price, content or *', async () => {
    const db = dbWith();
    await listParts(db, 5);
    assert.ok(db.calls[0].params.includes(5));
    assert.match(db.calls[0].sql, /j\.company_id = \?/);
    for (const { sql } of db.calls) {
        assert.doesNotMatch(sql, /price|content|details|\*/i);
    }
});

test('escapes LIKE wildcards with ! and never puts a backslash in SQL', async () => {
    const db = dbWith();
    await listParts(db, 5, { number: ' 50%_!\\ ', description: 'a_b' });
    const { sql, params } = db.calls[0];
    assert.match(sql, /p\.number LIKE \? ESCAPE '!'/);
    assert.match(sql, /p\.description LIKE \? ESCAPE '!'/);
    assert.deepStrictEqual(params, [5, '%50!%!_!!\\%', '%a!_b%']);
    for (const call of db.calls) assert.doesNotMatch(call.sql, /\\/);
});

test('every SQL listParts sends has closed quotes, with and without filters', async () => {
    const filters = [undefined, { number: '1' }, { description: 'x' }, { number: '1', description: 'x' }];
    for (const filter of filters) {
        const db = dbWith();
        await listParts(db, 5, filter);
        assert.ok(db.calls.length > 0);
        for (const { sql } of db.calls) assertMysqlQuotesClosed(sql);
    }
});

test('ignores non-string filters and caps strings at 100 chars', async () => {
    const db = dbWith();
    await listParts(db, 5, { number: 42, description: 'x'.repeat(150) });
    const { sql, params } = db.calls[0];
    assert.doesNotMatch(sql, /p\.number LIKE/);
    assert.deepStrictEqual(params, [5, `%${'x'.repeat(100)}%`]);
});

test('latest comes from the newest job row with its stage', async () => {
    const result = await listParts(dbWith(), 5);
    assert.deepStrictEqual(result[0].latest, {
        job_part_id: 101, job_id: 12, job_number: 'J12', rev: 'C', material: '6061', finish: 'Anodize', quantity: 50,
        po_date: '2026-03-05', stage: { key: 'in_shop', label: 'In the shop' }, job_open: true,
    });
});

test('latest stage is null for an unstarred part', async () => {
    const result = await listParts(dbWith(), 5);
    assert.deepStrictEqual(result[1].latest, {
        job_part_id: 71, job_id: 7, job_number: 'J7', rev: null, material: 'steel', finish: 'Zinc', quantity: 3, po_date: null, stage: null, job_open: true,
    });
});

test('query selects job_part facts and the star status', async () => {
    const db = dbWith();
    await listParts(db, 5);
    assert.match(db.calls[0].sql, /jp\.id AS job_part_id, jp\.rev, jp\.material, jp\.finish, jp\.quantity/);
    assert.match(db.calls[0].sql, /LEFT JOIN stars s ON s\.job_part_id = jp\.id/);
});

test('latest.job_open is true only when the newest job has no ship_date and no invoice_date', async () => {
    const row = (part_id, ship_date, invoice_date, star_status) => ({
        ...base(part_id, `P-${part_id}`, 'd'), job_id: part_id, job_number: `J${part_id}`, job_part_id: part_id,
        rev: null, material: null, finish: null, quantity: 1, star_status, ship_date, invoice_date,
    });
    const rows = [
        row(1, null, null, null),
        row(2, '2026-01-01', null, 'open'),
        row(3, null, '2026-01-02', null),
        row(4, '2026-01-01', '2026-01-02', 'open'),
        row(5, null, null, 'open'),
        { ...row(5, '2026-01-01', null, null), job_id: 99, job_part_id: 500 },
    ];
    const result = await listParts(makeFakeDb([{ match: /FROM job_part/, rows }, { match: /FROM uploaded_files/, rows: [] }]), 5);
    assert.deepStrictEqual(result.map((p) => p.latest.job_open), [true, false, false, false, true]);
});

test('query selects job po, ship and invoice dates but latest exposes only po_date', async () => {
    const db = dbWith();
    const result = await listParts(db, 5);
    assert.match(db.calls[0].sql, /j\.po_date/);
    assert.match(db.calls[0].sql, /j\.ship_date/);
    assert.match(db.calls[0].sql, /j\.invoice_date/);
    for (const part of result) assert.deepStrictEqual(Object.keys(part.latest).filter((k) => /date/.test(k)), ['po_date']);
});
