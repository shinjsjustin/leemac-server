const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const { createJobFromRequest } = require('../../src/lib/quoteRequestJob');
const { QuoteRequestError } = require('../../src/lib/quoteRequests');
const { EXACT_PARTS_SQL } = require('../../src/lib/partSearch');

const REQUEST = { id: 3, company_id: 'C1', client_name: 'Ann', status: 'sent' };
const LINES = [
    { id: 31, part_number: 'A-1', description: 'Bracket', rev: 'B', material: '6061', finish: null, quantity: 2, price: '5.50' },
    { id: 32, part_number: 'B-2', description: null, rev: null, material: null, finish: null, quantity: 1, price: '7.00' },
];

const PARTS = { 40: 'PN-40' };

function makeDb({ request = REQUEST, lines = LINES, exact = {} } = {}) {
    let partId = 10;
    let jobPartId = 100;
    const db = makeFakeTxDb([
        {
            // Answers only the real exact-part query text, keyed by its normalized number param.
            match: { test: (sql) => sql === EXACT_PARTS_SQL },
            rows: ([key]) => exact[key] || [],
        },
        { match: /FROM quote_request WHERE/, rows: request ? [request] : [] },
        { match: /FROM quote_request_line/, rows: lines },
        { match: /SELECT metavalue FROM metadata/, rows: [{ metavalue: '"41"' }] },
        { match: /INSERT INTO job \(/, rows: { insertId: 7 } },
        { match: /SELECT number FROM part WHERE id = \?/, rows: ([id]) => (PARTS[id] ? [{ number: PARTS[id] }] : []) },
        { match: /SELECT id FROM part WHERE number = \?/, rows: ([number]) => [{ id: Number(number.slice(3)) }] },
        {
            match: /INSERT IGNORE INTO part/,
            rows: ([number]) => (/^PN-/.test(number) ? { insertId: 0, affectedRows: 0 } : { insertId: (partId += 1), affectedRows: 1 }),
        },
        { match: /INSERT INTO job_part/, rows: () => ({ insertId: (jobPartId += 1) }) },
    ]);
    const wrap = (fn) => async (sql, params) => {
        assertMysqlQuotesClosed(sql);
        return fn(sql, params);
    };
    const getConnection = db.getConnection;
    db.getConnection = async () => {
        const conn = await getConnection();
        return { ...conn, execute: wrap(conn.execute), query: wrap(conn.query) };
    };
    return db;
}

const sqlCalls = (db, re) => db.calls.filter((c) => c.sql && re.test(c.sql));
const EXACT_PARTS_RE = { test: (sql) => sql === EXACT_PARTS_SQL };
const txLog = (db) => db.calls.filter((c) => c.tx).map((c) => c.tx);

test('creates one job from the request lines in one transaction and returns id and number', async () => {
    const db = makeDb();
    const result = await createJobFromRequest(db, 3);

    assert.deepStrictEqual(result, { id: 7, job_number: '42' });
    assert.match(sqlCalls(db, /FROM quote_request WHERE/)[0].sql, /FOR UPDATE/);
    assert.deepStrictEqual(sqlCalls(db, /FROM quote_request WHERE/)[0].params, [3]);
    assert.match(sqlCalls(db, /FROM quote_request_line/)[0].sql, /ORDER BY position/);
    assert.deepStrictEqual(sqlCalls(db, /INSERT INTO job \(/)[0].params, ['42', 'C1', 'Ann']);
    const jobParts = sqlCalls(db, /INSERT INTO job_part/);
    assert.strictEqual(jobParts.length, 2);
    assert.deepStrictEqual(jobParts[0].params, [7, 11, 2, 5.5, 'B', '6061', null, null, '*6061']);
    assert.deepStrictEqual(txLog(db), ['beginTransaction', 'commit', 'release']);
});

test('sets each line part_id and updates the part description only when the line has one', async () => {
    const db = makeDb();
    await createJobFromRequest(db, 3);

    const setPart = sqlCalls(db, /UPDATE quote_request_line SET part_id/);
    assert.deepStrictEqual(setPart.map((c) => c.params), [[11, 31], [12, 32]]);
    const desc = sqlCalls(db, /UPDATE part SET description/);
    assert.deepStrictEqual(desc.map((c) => c.params), [['Bracket', 11]]);
});

test('copies line files to the part and request files to the job, skipping same filename and size', async () => {
    const db = makeDb();
    await createJobFromRequest(db, 3);

    const copies = sqlCalls(db, /INSERT INTO uploaded_files/);
    assert.strictEqual(copies.length, 3);
    const [line1, line2, job] = copies;
    for (const c of copies) {
        assert.match(c.sql, /INSERT INTO uploaded_files \(filename, mimetype, size, content, (part_id|job_id)\)\s+SELECT/);
        assert.match(c.sql, /NOT EXISTS/);
        assert.match(c.sql, /u\.filename = f\.filename AND u\.size = f\.size/);
    }
    assert.match(line1.sql, /f\.line_id = \?/);
    assert.match(line1.sql, /u\.part_id = \?/);
    assert.deepStrictEqual(line1.params, [11, 31, 11]);
    assert.deepStrictEqual(line2.params, [12, 32, 12]);
    assert.match(job.sql, /f\.request_id = \? AND f\.line_id IS NULL/);
    assert.match(job.sql, /u\.job_id = \?/);
    assert.deepStrictEqual(job.params, [7, 3, 7]);
});

test('marks the request job_created with job_id and review time as the last write', async () => {
    const db = makeDb();
    await createJobFromRequest(db, 3);

    const last = sqlCalls(db, /UPDATE quote_request SET/);
    assert.strictEqual(last.length, 1);
    assert.match(last[0].sql, /status = 'job_created'/);
    assert.match(last[0].sql, /reviewed_at = NOW\(\)/);
    assert.match(last[0].sql, /updated_at = NOW\(\)/);
    assert.deepStrictEqual(last[0].params, [7, 3]);
    assert.strictEqual(db.calls.filter((c) => c.sql).at(-1), last[0]);
});

test('returns null for a missing or draft request and writes nothing', async () => {
    for (const request of [null, { ...REQUEST, status: 'draft' }]) {
        const db = makeDb({ request });
        assert.strictEqual(await createJobFromRequest(db, 3), null);
        assert.strictEqual(sqlCalls(db, /^\s*(INSERT|UPDATE|REPLACE)/).length, 0);
    }
});

test('rejects with 409 when the request already has a job', async () => {
    const db = makeDb({ request: { ...REQUEST, status: 'job_created' } });
    await assert.rejects(createJobFromRequest(db, 3), (e) => e instanceof QuoteRequestError && e.status === 409);
    assert.strictEqual(sqlCalls(db, /^\s*(INSERT|UPDATE|REPLACE)/).length, 0);
    assert.deepStrictEqual(txLog(db), ['beginTransaction', 'rollback', 'release']);
});

test('rejects with 400 before any insert when a line lacks part number, quantity or price', async () => {
    const bad = [{ part_number: null }, { part_number: '  ' }, { quantity: null }, { quantity: 0 }, { price: null }];
    for (const change of bad) {
        const db = makeDb({ lines: [LINES[0], { ...LINES[1], ...change }] });
        await assert.rejects(createJobFromRequest(db, 3), (e) => e instanceof QuoteRequestError && e.status === 400);
        assert.strictEqual(sqlCalls(db, /^\s*(INSERT|UPDATE|REPLACE)/).length, 0);
    }
});

test('links a list line to its source part by the source number even when the line number was edited', async () => {
    const listLine = { ...LINES[0], id: 33, part_number: 'PN-99', source_part_id: 40 };
    const db = makeDb({ lines: [listLine, LINES[1]] });
    await createJobFromRequest(db, 3);

    assert.match(sqlCalls(db, /FROM quote_request_line/)[0].sql, /source_part_id/);
    const jobParts = sqlCalls(db, /INSERT INTO job_part/);
    assert.deepStrictEqual(jobParts.map((c) => c.params[1]), [40, 11]);
    const inserts = sqlCalls(db, /INSERT IGNORE INTO part/).map((c) => c.params[0]);
    assert.deepStrictEqual(inserts, ['PN-40', 'B-2']);
    assert.deepStrictEqual(sqlCalls(db, /UPDATE quote_request_line SET part_id/).map((c) => c.params), [[40, 33], [11, 32]]);
});

const partRow = (id, number) => ({ id, number, description: null, job_number: null });

test('a line matching an existing part by spacing and case joins that part instead of making one', async () => {
    const line = { ...LINES[0], part_number: 'ABC 123' };
    const db = makeDb({ lines: [line], exact: { abc123: [partRow(60, 'abc123')] } });
    await createJobFromRequest(db, 3);

    assert.deepStrictEqual(sqlCalls(db, EXACT_PARTS_RE).map((c) => c.params), [['abc123']]);
    assert.deepStrictEqual(sqlCalls(db, /INSERT IGNORE INTO part/).map((c) => c.params[0]), ['abc123']);
});

test('a line with no exact part keeps its own number even when similar parts exist', async () => {
    const line = { ...LINES[0], part_number: 'ABC 123' };
    const db = makeDb({ lines: [line], exact: { 'abc-123': [partRow(61, 'abc-123')] } });
    await createJobFromRequest(db, 3);

    assert.deepStrictEqual(sqlCalls(db, /INSERT IGNORE INTO part/).map((c) => c.params[0]), ['ABC 123']);
});

test('a list line uses its source part and never runs the exact query', async () => {
    const listLine = { ...LINES[0], id: 33, part_number: 'PN-99', source_part_id: 40 };
    const db = makeDb({ lines: [listLine], exact: { 'pn-99': [partRow(62, 'other')] } });
    await createJobFromRequest(db, 3);

    assert.strictEqual(sqlCalls(db, EXACT_PARTS_RE).length, 0);
    assert.deepStrictEqual(sqlCalls(db, /INSERT IGNORE INTO part/).map((c) => c.params[0]), ['PN-40']);
});
