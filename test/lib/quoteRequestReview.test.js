const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const { QuoteRequestError } = require('../../src/lib/quoteRequests');
const {
    listInbox, getReview, saveReview, checkMatches, getRequestFile,
} = require('../../src/lib/quoteRequestReview');

const REQUEST = { id: 5, company_id: 'acme', status: 'sent', job_id: null };
const LINES = [
    { id: 10, request_id: 5, position: 0, part_number: ' ab-1 ', quantity: 2, price: '1.50', part_id: null, bourne_suggestion: '{"a":1}' },
    { id: 11, request_id: 5, position: 1, part_number: null, quantity: 1, price: null, part_id: 3, bourne_suggestion: null },
];
const FILES = [
    { id: 1, line_id: 10, filename: 'a.pdf', mimetype: 'application/pdf', size: 3 },
    { id: 2, line_id: null, filename: 'b.pdf', mimetype: 'application/pdf', size: 4 },
];

function dbWith({ request = REQUEST, lines = LINES, files = FILES, matches = [] } = {}) {
    const db = makeFakeTxDb([
        { match: /^\s*SELECT .* FROM quote_request WHERE/s, rows: (p) => (request && p[0] === request.id ? [request] : []) },
        { match: /^\s*SELECT .* FROM quote_request_line WHERE/s, rows: lines },
        { match: /^\s*SELECT .* FROM quote_request_file WHERE request_id/s, rows: files },
        { match: /FROM part p/, rows: matches },
        { match: /^\s*UPDATE/, rows: { affectedRows: 1 } },
    ]);
    const inner = db.execute;
    const guarded = async (sql, params) => { if (sql) assertMysqlQuotesClosed(sql); return inner(sql, params); };
    return Object.assign(db, { execute: guarded, query: guarded });
}
const sqlOf = (db) => db.calls.filter((c) => c.sql);
const updates = (db) => sqlOf(db).filter((c) => /^\s*UPDATE/.test(c.sql));
const save = (db, lines, id = 5) => saveReview(db, id, { lines });

test('listInbox excludes drafts, orders newest submitted first and passes no status filter by default', async () => {
    const db = dbWith();
    await listInbox(db, {});
    const { sql, params } = sqlOf(db)[0];
    assertMysqlQuotesClosed(sql);
    assert.match(sql, /status <> 'draft'/);
    assert.match(sql, /ORDER BY r\.submitted_at DESC/);
    assert.match(sql, /COUNT\(/);
    assert.match(sql, /company/);
    assert.match(sql, /job_number/);
    assert.deepEqual(params, []);
});

test('listInbox filters by one status when given', async () => {
    const db = dbWith();
    await listInbox(db, { status: 'in_review' });
    const { sql, params } = sqlOf(db)[0];
    assert.match(sql, /r\.status = \?/);
    assert.deepEqual(params, ['in_review']);
});

test('getReview returns lines with parsed suggestion and files without content', async () => {
    const review = await getReview(dbWith(), 5);
    assert.equal(review.id, 5);
    assert.equal(review.lines.length, 2);
    assert.deepEqual(review.lines[0].bourne_suggestion, { a: 1 });
    assert.equal(review.lines[1].bourne_suggestion, null);
    assert.equal(review.lines[1].part_id, 3);
    assert.equal(review.lines[0].price, '1.50');
    assert.deepEqual(review.lines[0].files, [FILES[0]]);
    assert.deepEqual(review.files, [FILES[1]]);
    for (const c of sqlOf(dbWith())) assert.doesNotMatch(c.sql, /content/);
});

test('getReview accepts a bourne_suggestion already parsed by the driver', async () => {
    const db = dbWith({ lines: [{ ...LINES[0], bourne_suggestion: { a: 2 } }] });
    assert.deepEqual((await getReview(db, 5)).lines[0].bourne_suggestion, { a: 2 });
});

test('getReview returns null when missing or draft', async () => {
    assert.equal(await getReview(dbWith({ request: null }), 5), null);
    assert.equal(await getReview(dbWith({ request: { ...REQUEST, status: 'draft' } }), 5), null);
});

test('getReview does not read lines for a draft', async () => {
    const db = dbWith({ request: { ...REQUEST, status: 'draft' } });
    await getReview(db, 5);
    assert.equal(sqlOf(db).length, 1);
});

test('saveReview updates only listed lines, trims text, normalizes price and sets in_review', async () => {
    const db = dbWith();
    const result = await save(db, [
        { id: 10, part_number: '  P-1  ', description: 'd'.repeat(300), rev: 'r'.repeat(20), material: ' ', finish: 'f', quantity: '4', price: '2.345' },
    ]);
    assert.equal(result.id, 5);
    const lineUpdates = updates(db).filter((c) => /quote_request_line/.test(c.sql));
    assert.equal(lineUpdates.length, 1);
    assert.deepEqual(lineUpdates[0].params, ['P-1', 'd'.repeat(255), 'r'.repeat(10), null, 'f', 4, 2.35, 10, 5]);
    const header = updates(db).find((c) => /UPDATE quote_request SET/.test(c.sql));
    assert.match(header.sql, /status = 'in_review'/);
    assert.match(header.sql, /updated_at = NOW\(\)/);
    assert.deepEqual(header.params, [5]);
    assert.ok(db.calls.some((c) => c.tx === 'commit'));
    assert.match(sqlOf(db)[0].sql, /FOR UPDATE/);
});

test('saveReview allows a null price', async () => {
    const db = dbWith();
    await save(db, [{ id: 10, quantity: 1, price: null }]);
    assert.equal(updates(db)[0].params[6], null);
});

test('saveReview accepts line ids as numeric strings', async () => {
    const db = dbWith();
    await save(db, [{ id: '10', quantity: 1 }]);
    assert.equal(updates(db)[0].params[7], 10);
});

test('saveReview rejects an unknown line id with 400 and rolls back', async () => {
    const db = dbWith();
    await assert.rejects(save(db, [{ id: 99, quantity: 1 }]), (e) => e instanceof QuoteRequestError && e.status === 400);
    assert.equal(updates(db).length, 0);
    assert.ok(db.calls.some((c) => c.tx === 'rollback'));
});

test('saveReview rejects bad quantities with 400', async () => {
    for (const quantity of [0, 1.5, -2, 'x', null, undefined, '']) {
        await assert.rejects(save(dbWith(), [{ id: 10, quantity }]), (e) => e.status === 400, String(quantity));
    }
});

test('saveReview rejects bad prices with 400', async () => {
    for (const price of [-1, 'abc', {}, true]) {
        const db = dbWith();
        await assert.rejects(save(db, [{ id: 10, quantity: 1, price }]), (e) => e.status === 400);
        assert.equal(updates(db).length, 0);
    }
});

test('saveReview rejects a job_created request with 409', async () => {
    const db = dbWith({ request: { ...REQUEST, status: 'job_created' } });
    await assert.rejects(save(db, [{ id: 10, quantity: 1 }]), (e) => e.status === 409);
    assert.equal(updates(db).length, 0);
});

test('saveReview returns null for a missing or draft request', async () => {
    assert.equal(await save(dbWith({ request: null }), [{ id: 10, quantity: 1 }]), null);
    const draft = dbWith({ request: { ...REQUEST, status: 'draft' } });
    assert.equal(await save(draft, [{ id: 10, quantity: 1 }]), null);
    assert.equal(updates(draft).length, 0);
});

test('saveReview rejects a non-array lines body with 400', async () => {
    await assert.rejects(saveReview(dbWith(), 5, {}), (e) => e.status === 400);
});

test('checkMatches matches trimmed lowercase part numbers and lists jobs per line', async () => {
    const db = dbWith({
        matches: [
            { part_id: 7, number: 'AB-1', description: 'Bracket', job_id: 40, job_number: 'J-40' },
            { part_id: 7, number: 'AB-1', description: 'Bracket', job_id: 41, job_number: 'J-41' },
            { part_id: 8, number: 'ab-1 ', description: null, job_id: null, job_number: null },
        ],
    });
    const result = await checkMatches(db, 5);
    assert.deepEqual(result, [{
        line_id: 10,
        part_number: ' ab-1 ',
        matches: [
            { part_id: 7, number: 'AB-1', description: 'Bracket', jobs: [{ id: 40, job_number: 'J-40' }, { id: 41, job_number: 'J-41' }] },
            { part_id: 8, number: 'ab-1 ', description: null, jobs: [] },
        ],
    }]);
    const query = sqlOf(db).filter((c) => /FROM part p/.test(c.sql));
    assert.equal(query.length, 1);
    assert.match(query[0].sql, /LOWER\(TRIM\(p\.number\)\) IN/);
    assert.deepEqual(query[0].params, ['ab-1']);
});

test('checkMatches returns an empty matches list when nothing matches and skips lines without a part number', async () => {
    const db = dbWith({ lines: [LINES[1], { ...LINES[0], id: 12, part_number: '  ' }] });
    assert.deepEqual(await checkMatches(db, 5), []);
    assert.equal(sqlOf(db).filter((c) => /FROM part p/.test(c.sql)).length, 0);
    const unmatched = await checkMatches(dbWith(), 5);
    assert.deepEqual(unmatched, [{ line_id: 10, part_number: ' ab-1 ', matches: [] }]);
});

test('checkMatches returns null for a missing or draft request', async () => {
    assert.equal(await checkMatches(dbWith({ request: null }), 5), null);
    assert.equal(await checkMatches(dbWith({ request: { ...REQUEST, status: 'draft' } }), 5), null);
});

test('getRequestFile returns the file of a non-draft request or null', async () => {
    const row = { filename: 'a.pdf', mimetype: 'application/pdf', content: Buffer.from('abc') };
    const db = makeFakeTxDb([{ match: /FROM quote_request_file/, rows: (p) => (p[0] === 5 && p[1] === 1 ? [row] : []) }]);
    assert.deepEqual(await getRequestFile(db, 5, 1), row);
    const { sql } = db.calls[0];
    assertMysqlQuotesClosed(sql);
    assert.match(sql, /status <> 'draft'/);
    assert.equal(await getRequestFile(db, 5, 2), null);
});
