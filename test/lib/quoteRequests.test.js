const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const {
    QuoteRequestError, normaliseLines, createDraft, updateDraft,
    listRequests, getRequest, submitRequest,
} = require('../../src/lib/quoteRequests');

const USER = { id: 'c7', name: 'Pat Client', company_id: 'acme' };

function requestRow(over = {}) {
    return { id: 5, company_id: 'acme', client_id: 'c7', client_name: 'Pat Client', name: 'R', need_by: null, note: null, status: 'draft', ...over };
}

// Handlers keyed on SQL shape; request lookups honour the company_id param.
function dbWith({ request = requestRow(), lines = [], files = [], existingLineIds = [] } = {}) {
    return makeFakeTxDb([
        { match: /^\s*SELECT .* FROM quote_request WHERE/s, rows: (p) => (p.includes(request.company_id) && p.includes(request.id) ? [request] : []) },
        { match: /^\s*SELECT id FROM quote_request_line/, rows: existingLineIds.map((id) => ({ id })) },
        { match: /^\s*SELECT .* FROM quote_request_line/s, rows: lines },
        { match: /^\s*SELECT .* FROM quote_request_file/s, rows: files },
        { match: /^\s*INSERT INTO quote_request /, rows: { insertId: 5 } },
        { match: /^\s*INSERT INTO quote_request_line/, rows: { insertId: 90 } },
    ]);
}

const writes = (db) => db.calls.filter((c) => c.sql && /^\s*(INSERT|UPDATE|DELETE)/.test(c.sql));

test('every SQL statement has closed quotes', async () => {
    const db = dbWith({ lines: [{ id: 1, position: 0, quantity: 2, part_number: 'A' }], existingLineIds: [1] });
    await createDraft(db, USER, { name: 'x', lines: [{ part_number: 'A' }] });
    await updateDraft(db, USER, 5, { lines: [{ id: 1, part_number: 'A' }, { part_number: 'B' }] });
    await listRequests(db, USER);
    await getRequest(db, USER, 5);
    await submitRequest(db, USER, 5).catch(() => {});
    assert.ok(db.calls.length > 5);
    for (const c of db.calls) if (c.sql) assertMysqlQuotesClosed(c.sql);
});

test('normaliseLines drops empty lines, trims, caps and ignores forbidden keys', () => {
    const out = normaliseLines([
        { part_number: '   ', description: '', quantity: '' },
        { part_number: `  ${'p'.repeat(150)} `, description: ' d ', rev: 'A', price: 9, part_id: 3, bourne_suggestion: { a: 1 }, quantity: '4' },
        {},
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].part_number, 'p'.repeat(100));
    assert.equal(out[0].description, 'd');
    assert.equal(out[0].quantity, 4);
    assert.equal(out[0].material, null);
    for (const k of ['price', 'part_id', 'bourne_suggestion']) assert.equal(k in out[0], false);
});

test('normaliseLines rejects bad quantity and more than 200 lines', () => {
    for (const q of [0, -1, 1.5, 'abc']) {
        assert.throws(() => normaliseLines([{ part_number: 'A', quantity: q }]), (e) => e.status === 400);
    }
    const many = Array.from({ length: 201 }, () => ({ part_number: 'A' }));
    assert.throws(() => normaliseLines(many), (e) => e instanceof QuoteRequestError && e.status === 400);
});

test('createDraft takes client from user, not body, and rejects bad need_by', async () => {
    const db = dbWith();
    await createDraft(db, USER, { name: 'N', client_id: 'evil', company_id: 'evil', client_name: 'Evil', need_by: '2026-12-01', lines: [{ part_number: 'A' }] });
    const ins = db.calls.find((c) => /^\s*INSERT INTO quote_request /.test(c.sql));
    assert.ok(ins.params.includes('acme') && ins.params.includes('c7') && ins.params.includes('Pat Client'));
    assert.ok(!ins.params.includes('evil') && !ins.params.includes('Evil'));
    assert.ok(ins.params.includes('2026-12-01'));
    await assert.rejects(createDraft(dbWith(), USER, { need_by: '12/01/2026' }), (e) => e.status === 400);
    await assert.rejects(createDraft(dbWith(), USER, { name: 'n'.repeat(101) }), (e) => e.status === 400);
});

test('updateDraft returns null with no write for another company', async () => {
    const db = dbWith();
    const res = await updateDraft(db, { ...USER, company_id: 'other' }, 5, { name: 'x' });
    assert.equal(res, null);
    assert.equal(writes(db).length, 0);
});

test('updateDraft throws 409 when not draft', async () => {
    const db = dbWith({ request: requestRow({ status: 'sent' }) });
    await assert.rejects(updateDraft(db, USER, 5, { name: 'x' }), (e) => e instanceof QuoteRequestError && e.status === 409);
    assert.equal(writes(db).length, 0);
});

test('updateDraft updates, inserts and deletes lines in array order inside a transaction', async () => {
    const db = dbWith({ existingLineIds: [1, 2] });
    await updateDraft(db, USER, 5, { name: 'N', lines: [{ part_number: 'NEW' }, { id: 1, part_number: 'ONE' }, { id: 99, part_number: 'FOREIGN' }] });
    const tags = db.calls.filter((c) => c.tx).map((c) => c.tx);
    assert.deepEqual(tags, ['beginTransaction', 'commit', 'release']);
    const del = db.calls.find((c) => /^\s*DELETE FROM quote_request_line/.test(c.sql));
    assert.deepEqual(del.params.slice(-1), [2]);
    assert.ok(del.params.includes(5));
    const upd = db.calls.filter((c) => /^\s*UPDATE quote_request_line/.test(c.sql));
    assert.equal(upd.length, 1);
    assert.ok(upd[0].params.includes('ONE') && upd[0].params.includes(1) && upd[0].params.includes(1));
    const ins = db.calls.filter((c) => /^\s*INSERT INTO quote_request_line/.test(c.sql));
    assert.equal(ins.length, 2);
    assert.ok(ins[0].params.includes('NEW') && ins[0].params.includes(0));
    assert.ok(ins[1].params.includes('FOREIGN') && ins[1].params.includes(2));
});

test('updateDraft rolls back when a write fails', async () => {
    const db = makeFakeTxDb([
        { match: /^\s*SELECT .* FROM quote_request WHERE/s, rows: [requestRow()] },
        { match: /^\s*UPDATE quote_request /, error: new Error('boom') },
    ]);
    await assert.rejects(updateDraft(db, USER, 5, { name: 'x' }), /boom/);
    assert.ok(db.calls.some((c) => c.tx === 'rollback'));
});

test('getRequest returns null for missing or other-company ids', async () => {
    assert.equal(await getRequest(dbWith(), { ...USER, company_id: 'other' }, 5), null);
    assert.equal(await getRequest(dbWith(), USER, 6), null);
});

test('getRequest nests files per line and request-level, without secret keys', async () => {
    const db = dbWith({
        lines: [{ id: 1, position: 0, part_number: 'A' }, { id: 2, position: 1, part_number: 'B' }],
        files: [
            { id: 10, line_id: 1, filename: 'a.pdf', mimetype: 'application/pdf', size: 3 },
            { id: 11, line_id: null, filename: 'r.pdf', mimetype: 'application/pdf', size: 4 },
        ],
    });
    const r = await getRequest(db, USER, 5);
    assert.deepEqual(r.lines[0].files, [{ id: 10, filename: 'a.pdf', mimetype: 'application/pdf', size: 3 }]);
    assert.deepEqual(r.lines[1].files, []);
    assert.deepEqual(r.files, [{ id: 11, filename: 'r.pdf', mimetype: 'application/pdf', size: 4 }]);
    const json = JSON.stringify(r);
    for (const k of ['price', 'part_id', 'bourne_suggestion', 'content']) assert.ok(!json.includes(`"${k}"`));
    for (const c of db.calls) {
        assert.ok(!/\b(price|part_id|bourne_suggestion|content)\b/.test(c.sql), c.sql);
        assert.ok(!/SELECT\s+\*/i.test(c.sql));
    }
});

test('every read filters by company_id', async () => {
    const db = dbWith();
    await listRequests(db, USER);
    await getRequest(db, USER, 5);
    const reads = db.calls.filter((c) => /FROM quote_request\b(?!_)/.test(c.sql));
    assert.ok(reads.length >= 2);
    for (const c of reads) {
        assert.match(c.sql, /company_id = \?/);
        assert.ok(c.params.includes('acme'));
    }
});

test('submitRequest throws 409 when not draft', async () => {
    const db = dbWith({ request: requestRow({ status: 'in_review' }) });
    await assert.rejects(submitRequest(db, USER, 5), (e) => e.status === 409);
    assert.equal(writes(db).length, 0);
});

test('submitRequest returns null for another company with no write', async () => {
    const db = dbWith();
    assert.equal(await submitRequest(db, { ...USER, company_id: 'other' }, 5), null);
    assert.equal(writes(db).length, 0);
});

test('submitRequest throws 400 for no lines or an invalid line', async () => {
    const bad = [
        [],
        [{ id: 1, position: 0, part_number: 'A', description: null, quantity: null }],
        [{ id: 1, position: 0, part_number: 'A', description: null, quantity: 0 }],
        [{ id: 1, position: 0, part_number: null, description: null, quantity: 2 }],
    ];
    for (const lines of bad) {
        const db = dbWith({ lines });
        await assert.rejects(submitRequest(db, USER, 5), (e) => e instanceof QuoteRequestError && e.status === 400);
        assert.equal(writes(db).length, 0);
    }
});

test('submitRequest marks a valid draft sent, guarded by company and draft status', async () => {
    const db = dbWith({ lines: [{ id: 1, position: 0, part_number: null, description: 'Bracket', quantity: 2 }] });
    await submitRequest(db, USER, 5);
    const upd = db.calls.find((c) => /^\s*UPDATE quote_request /.test(c.sql));
    assert.match(upd.sql, /status = 'sent'/);
    assert.match(upd.sql, /company_id = \?/);
    assert.match(upd.sql, /status = 'draft'/);
    assert.ok(upd.params.includes('acme') && upd.params.includes(5));
});
