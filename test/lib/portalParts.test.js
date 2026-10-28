const test = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const { listParts } = require('../../src/lib/portal');

const PART_ROWS = [
    { part_id: 1, part_number: 'A-1', part_description: 'Bracket', job_id: 12, job_number: 'J12' },
    { part_id: 1, part_number: 'A-1', part_description: 'Bracket', job_id: 12, job_number: 'J12' },
    { part_id: 1, part_number: 'A-1', part_description: 'Bracket', job_id: 7, job_number: 'J7' },
    { part_id: 2, part_number: 'B-2', part_description: 'Plate', job_id: 7, job_number: 'J7' },
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
            ['drawing_count', 'jobs', 'latest_drawing', 'part_description', 'part_id', 'part_number']
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
