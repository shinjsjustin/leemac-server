const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const { QuoteRequestError } = require('../../src/lib/quoteRequests');
const { getRequestLines, createRequestFromList } = require('../../src/lib/partListRequest');

const user = { id: 7, name: 'Pat', company_id: 3 };
const writes = (db) => db.calls.filter((c) => c.sql && /^\s*(INSERT|UPDATE|DELETE)/i.test(c.sql));
const checkSql = (db) => db.calls.filter((c) => c.sql).forEach((c) => {
    assertMysqlQuotesClosed(c.sql);
    assert.doesNotMatch(c.sql, /price/);
});
const rejects = (p, status) => assert.rejects(p, (e) => e instanceof QuoteRequestError && e.status === status);

const LIST = { match: /FROM part_list WHERE id = \?/, rows: [{ id: 1, name: 'Brackets' }] };
const ITEMS = {
    match: /FROM part_list_item/,
    rows: [{ part_id: 10, part_number: 'A-1', description: 'Bracket' }, { part_id: 11, part_number: 'B-2', description: null }],
};

test('getRequestLines combines part, latest same-company job_part and drawings', async () => {
    const db = makeFakeTxDb([
        LIST,
        ITEMS,
        {
            match: /FROM job_part/,
            rows: [
                { part_id: 10, rev: 'C', material: 'Al', finish: 'Anodize' },
                { part_id: 10, rev: 'A', material: 'Steel', finish: null },
            ],
        },
        { match: /FROM uploaded_files/, rows: [{ id: 5, part_id: 10, filename: 'a.pdf', mimetype: 'application/pdf' }] },
    ]);
    const lines = await getRequestLines(db, user, 1);
    assert.deepEqual(lines, [
        { part_id: 10, part_number: 'A-1', description: 'Bracket', rev: 'C', material: 'Al', finish: 'Anodize',
            drawings: [{ id: 5, filename: 'a.pdf', mimetype: 'application/pdf' }] },
        { part_id: 11, part_number: 'B-2', description: null, rev: null, material: null, finish: null, drawings: [] },
    ]);
    const [listCall, itemCall, jobCall, fileCall] = db.calls;
    assert.deepEqual(listCall.params, [1, 3]);
    assert.match(itemCall.sql, /ORDER BY p\.number/);
    assert.match(jobCall.sql, /j\.company_id = \?/);
    assert.match(jobCall.sql, /ORDER BY j\.created_at DESC, j\.id DESC/);
    assert.deepEqual(jobCall.params, [3, 10, 11]);
    assert.match(fileCall.sql, /job_id IS NULL AND (\w+\.)?note_id IS NULL/);
    checkSql(db);
});

test('getRequestLines returns null for another company list and [] for an empty list', async () => {
    const other = makeFakeTxDb([{ match: /FROM part_list WHERE/, rows: [] }]);
    assert.equal(await getRequestLines(other, user, 1), null);
    assert.equal(other.calls.length, 1);
    const empty = makeFakeTxDb([LIST]);
    assert.deepEqual(await getRequestLines(empty, user, 1), []);
});

function submitDb(extra = []) {
    return makeFakeTxDb([
        ...extra,
        { match: /^\s*INSERT INTO quote_request /, rows: { insertId: 42 } },
        LIST,
        ITEMS,
        { match: /FROM quote_request WHERE id/, rows: [{ id: 42, status: 'sent' }] },
    ]);
}

test('createRequestFromList inserts a sent request and lines with database part numbers', async () => {
    const db = submitDb();
    const result = await createRequestFromList(db, user, 1, {
        name: '  ',
        lines: [
            { part_id: 10, part_number: 'EVIL', quantity: '5', description: ' Bracket ', rev: 'C', material: 'Al', finish: '' },
            { part_id: 11, quantity: '' },
        ],
    });
    assert.equal(result.id, 42);
    const insert = db.calls.find((c) => /^\s*INSERT INTO quote_request /.test(c.sql));
    assert.match(insert.sql, /'sent'/);
    assert.match(insert.sql, /submitted_at/);
    assert.deepEqual(insert.params, [3, '7', 'Pat', 'Brackets']);
    const lineInserts = db.calls.filter((c) => /INSERT INTO quote_request_line/.test(c.sql));
    assert.equal(lineInserts.length, 1);
    assert.match(lineInserts[0].sql, /source_part_id/);
    assert.deepEqual(lineInserts[0].params, [42, 0, 'A-1', 'Bracket', 'C', 'Al', null, 5, 10]);
    assert.ok(db.calls.some((c) => c.tx === 'commit'));
    checkSql(db);
});

test('createRequestFromList uses a given name and trims line text to column sizes', async () => {
    const db = submitDb();
    await createRequestFromList(db, user, 1, {
        name: ' Mine ',
        lines: [{ part_id: 10, quantity: 1, description: 'd'.repeat(300), rev: 'r'.repeat(20), material: 'm'.repeat(150) }],
    });
    const insert = db.calls.find((c) => /^\s*INSERT INTO quote_request /.test(c.sql));
    assert.equal(insert.params[3], 'Mine');
    const line = db.calls.find((c) => /INSERT INTO quote_request_line/.test(c.sql));
    assert.deepEqual(line.params.slice(3, 6).map((s) => s.length), [255, 10, 100]);
});

test('createRequestFromList rejects bad input and writes nothing', async () => {
    const cases = [
        [{ lines: [{ part_id: 10, quantity: '' }] }, 400],
        [{ lines: [] }, 400],
        [{ lines: [{ part_id: 10, quantity: 0 }] }, 400],
        [{ lines: [{ part_id: 10, quantity: 1.5 }] }, 400],
        [{ lines: [{ part_id: 10, quantity: 'abc' }] }, 400],
        [{ name: 'x'.repeat(101), lines: [{ part_id: 10, quantity: 1 }] }, 400],
        [{ lines: 'nope' }, 400],
        [{ lines: [{ part_id: 10, quantity: 1 }, { part_id: 99, quantity: 1 }] }, 409],
        [{ lines: [{ part_id: 99, quantity: '' }] }, 409],
    ];
    for (const [body, status] of cases) {
        const db = submitDb();
        await rejects(createRequestFromList(db, user, 1, body), status);
        assert.equal(writes(db).length, 0);
        assert.ok(db.calls.some((c) => c.tx === 'rollback'));
    }
});

test('createRequestFromList gives the stale-list message on 409', async () => {
    await assert.rejects(
        createRequestFromList(submitDb(), user, 1, { lines: [{ part_id: 99, quantity: 1 }] }),
        { message: 'This list changed. Reload it and try again.' }
    );
});

test('createRequestFromList returns null for another company list with no writes', async () => {
    const db = makeFakeTxDb([{ match: /FROM part_list WHERE/, rows: [] }]);
    assert.equal(await createRequestFromList(db, user, 1, { lines: [{ part_id: 10, quantity: 1 }] }), null);
    assert.equal(writes(db).length, 0);
    assert.deepEqual(db.calls.find((c) => c.sql).params, [1, 3]);
});
