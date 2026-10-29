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
function dbWith({ request = requestRow(), lines = [], files = [], existingLineIds = [], partFiles = [] } = {}) {
    return makeFakeTxDb([
        { match: /^\s*SELECT .* FROM quote_request WHERE/s, rows: (p) => (p.includes(request.company_id) && p.includes(request.id) ? [request] : []) },
        { match: /^\s*SELECT id FROM quote_request_line/, rows: existingLineIds.map((id) => ({ id })) },
        { match: /^\s*SELECT .* FROM quote_request_line/s, rows: lines },
        { match: /^\s*SELECT .* FROM quote_request_file/s, rows: files },
        { match: /FROM uploaded_files/, rows: partFiles },
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

test('listRequests rows carry numeric line_count, boolean from_list and job_number', async () => {
    const db = makeFakeTxDb([{
        match: /^\s*SELECT .* FROM quote_request WHERE/s,
        rows: [
            requestRow({ id: 1, line_count: '4', from_list: 1, job_number: 'J9' }),
            requestRow({ id: 2, line_count: null, from_list: 0, job_number: null }),
        ],
    }]);
    const rows = await listRequests(db, USER);
    assert.deepStrictEqual(rows.map((r) => [r.line_count, r.from_list, r.job_number]), [[4, true, 'J9'], [0, false, null]]);
});

test('listRequests SQL counts lines, flags list source, joins job, binds company and selects no price', async () => {
    const db = dbWith();
    await listRequests(db, USER);
    const { sql, params } = db.calls[0];
    assert.match(sql, /COUNT\(\*\) FROM quote_request_line/);
    assert.match(sql, /source_part_id IS NOT NULL/);
    assert.match(sql, /job_number/);
    assert.match(sql, /FROM quote_request WHERE/);
    assert.deepStrictEqual(params, ['acme']);
    assert.doesNotMatch(sql, /price/i);
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
    ];
    for (const lines of bad) {
        const db = dbWith({ lines });
        await assert.rejects(
            submitRequest(db, USER, 5),
            (e) => e instanceof QuoteRequestError && e.status === 400 && (!lines.length || e.message === 'Each row needs a quantity of at least 1.')
        );
        assert.equal(writes(db).length, 0);
    }
});

test('submitRequest sends a line with a quantity but no part number or description', async () => {
    const db = dbWith({ lines: [{ id: 1, position: 0, part_number: null, description: null, quantity: 2 }] });
    await submitRequest(db, USER, 5);
    assert.equal(db.calls.filter((c) => /^\s*UPDATE quote_request /.test(c.sql) && /status = 'sent'/.test(c.sql)).length, 1);
});

test('normaliseLines keeps a files-only line without writing has_files, and still drops an empty one', () => {
    const out = normaliseLines([{ has_files: true }, { has_files: false }, { id: 4, has_files: true, quantity: '' }]);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((l) => l.id), [null, 4]);
    for (const l of out) {
        assert.equal(l.part_number, null);
        assert.equal(l.quantity, null);
        assert.equal('has_files' in l, false);
    }
});

test('createDraft inserts a files-only line with null fields', async () => {
    const db = dbWith();
    await createDraft(db, USER, { lines: [{ has_files: true }] });
    const ins = db.calls.filter((c) => /^\s*INSERT INTO quote_request_line/.test(c.sql));
    assert.equal(ins.length, 1);
    assert.deepEqual(ins[0].params, [5, 0, null, null, null, null, null, null]);
    assert.ok(!/has_files/.test(ins[0].sql));
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

test('updateDraft keeps a saved line whose id is sent as a string', async () => {
    const db = dbWith({ existingLineIds: [1] });
    await updateDraft(db, USER, 5, { lines: [{ id: '1', part_number: 'ONE' }] });
    assert.equal(db.calls.filter((c) => /^\s*DELETE FROM quote_request_line/.test(c.sql)).length, 0);
    const upd = db.calls.filter((c) => /^\s*UPDATE quote_request_line/.test(c.sql));
    assert.equal(upd.length, 1);
    assert.ok(upd[0].params.includes(1));
    assert.equal(db.calls.filter((c) => /^\s*INSERT INTO quote_request_line/.test(c.sql)).length, 0);
});

test('normaliseLines treats non-positive-integer ids as new lines', () => {
    for (const id of ['0', '-1', '1.5', 'abc', 1.5, '12345678901', ' 1', '01']) {
        assert.equal(normaliseLines([{ id, part_number: 'A' }])[0].id, null, String(id));
    }
    assert.equal(normaliseLines([{ id: '12', part_number: 'A' }])[0].id, 12);
    assert.equal(normaliseLines([{ id: 12, part_number: 'A' }])[0].id, 12);
});

test('exports withTransaction', () => {
    assert.equal(typeof require('../../src/lib/quoteRequests').withTransaction, 'function');
});

const PART_FILE = { part_id: 7, id: 30, filename: 'd.pdf', mimetype: 'application/pdf', size: 9 };

test('getRequest returns source_part_id and part_files for list lines, [] for others', async () => {
    const db = dbWith({
        lines: [{ id: 1, position: 0, source_part_id: 7 }, { id: 2, position: 1, source_part_id: null }, { id: 3, position: 2, source_part_id: 8 }],
        partFiles: [PART_FILE],
    });
    const r = await getRequest(db, USER, 5);
    assert.deepEqual(r.lines.map((l) => l.source_part_id), [7, null, 8]);
    assert.deepEqual(r.lines[0].part_files, [{ id: 30, filename: 'd.pdf', mimetype: 'application/pdf', size: 9 }]);
    assert.deepEqual(r.lines[1].part_files, []);
    assert.deepEqual(r.lines[2].part_files, []);
});

test('getRequest only reads drawings of source parts on the company jobs', async () => {
    const db = dbWith({ lines: [{ id: 1, position: 0, source_part_id: 7 }, { id: 3, position: 2, source_part_id: 8 }], partFiles: [PART_FILE] });
    await getRequest(db, USER, 5);
    const q = db.calls.filter((c) => /FROM uploaded_files/.test(c.sql));
    assert.equal(q.length, 1);
    assert.match(q[0].sql, /job_id IS NULL/);
    assert.match(q[0].sql, /note_id IS NULL/);
    assert.match(q[0].sql, /EXISTS/);
    assert.match(q[0].sql, /j\.company_id = \?/);
    assert.deepEqual(q[0].params.slice().sort(), [7, 8, 'acme'].sort());
    assertMysqlQuotesClosed(q[0].sql);
});

test('getRequest runs no drawing query when no line has a source part', async () => {
    const db = dbWith({ lines: [{ id: 1, position: 0, source_part_id: null }] });
    const r = await getRequest(db, USER, 5);
    assert.equal(db.calls.some((c) => /uploaded_files/.test(c.sql)), false);
    assert.deepEqual(r.lines[0].part_files, []);
});
